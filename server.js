import express from 'express';
import path, { dirname } from 'node:path';
import https from 'node:https';
import winston from 'winston';
import { fileURLToPath } from 'node:url';
import { appendFile, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const logger = winston.createLogger({
	level: 'info',
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.errors({ stack: true }),
		winston.format.json(),
	),
	transports: [new winston.transports.Console()],
});
logger.info('Attempting to start the host-provisioning-service...');

logger.info('configuration directly from environment variable values:');
logger.info(`insecure: ${process.env.insecure}`);
logger.info(`port: ${process.env.port}`);

const insecure = process.env.insecure || false;
let port = process.env.port;
if (isNaN(port)) {
	logger.info(
		'Port was not provided via environment variable or is not a number.',
	);
	if (insecure) {
		port = 80;
		logger.info(`Using default http port: ${port}.`);
	} else {
		port = 443;
		logger.info(`Using default https port ${port}.`);
	}
	logger.info('Set the port environment variable to use a different port.');
}

logger.info('configuration after processing:');
logger.info(`insecure: ${insecure}`);
logger.info(`port: ${port}`);

if (
	insecure === false &&
	(process.env.server_tls_certificate === undefined ||
		process.env.server_tls_private_key === undefined)
) {
	logger.error(
		'server_tls_certificate and server_tls_private_key are ' +
			'required for secure connections. Before running the server, ' +
			'export the environment variables (for example ' +
			'`export server_tls_certificate="$(cat /path/to/cert.pem)"`). ' +
			'Alternatively, set insecure to true (not recommended).',
	);
	process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const contentDirectory = path.join(__dirname, 'content');
const metaDataPath = path.join(contentDirectory, 'meta-data');
const userDataPath = path.join(contentDirectory, 'user-data');
const metaDataCounterPath = path.join(
	contentDirectory,
	'.meta-data-hostname-counter',
);
const metaDataAssignmentsPath = path.join(
	contentDirectory,
	'.meta-data-instance-assignments.json',
);
const generatedInstancesLogPath = path.join(
	contentDirectory,
	'generated-instances.log',
);
const metaDataTemplate = readFileSync(metaDataPath, 'utf8');
const userDataContent = readFileSync(userDataPath, 'utf8');

const STATIC_IP_PREFIX = '10.0.10.';
const STATIC_IP_START = 100;
const CONTROL_IP_START = 100;
const CONTROL_IP_END = 199;
const WORKER_IP_START = 200;
const WORKER_IP_END = 254;
const computeStaticIpAddress = (index) =>
	`${STATIC_IP_PREFIX}${STATIC_IP_START + index}`;
const computePrefixedStaticIp = (offset, ceiling, suffixNumber) => {
	const lastOctet = offset + suffixNumber;
	return `${STATIC_IP_PREFIX}${lastOctet > ceiling ? ceiling : lastOctet}`;
};
const deriveIpAddressFromHostname = (hostname) => {
	if (typeof hostname !== 'string') {
		return computeStaticIpAddress(0);
	}
	const match = hostname.match(/(\d+)$/);
	if (!match) {
		return computeStaticIpAddress(0);
	}
	const suffixNumber = Number.parseInt(match[1], 10);
	if (Number.isNaN(suffixNumber)) {
		return computeStaticIpAddress(0);
	}
	if (hostname.startsWith('control')) {
		return computePrefixedStaticIp(CONTROL_IP_START, CONTROL_IP_END, suffixNumber);
	}
	if (hostname.startsWith('worker')) {
		return computePrefixedStaticIp(WORKER_IP_START, WORKER_IP_END, suffixNumber);
	}
	return computeStaticIpAddress(suffixNumber);
};

let metaDataHostnameCounter = 0;
try {
	if (existsSync(metaDataCounterPath)) {
		const storedCounter = Number.parseInt(
			readFileSync(metaDataCounterPath, 'utf8').trim(),
			10,
		);
		if (!Number.isNaN(storedCounter)) {
			metaDataHostnameCounter = storedCounter;
		} else {
			logger.warn(
				'The hostname counter file contained an invalid value. Starting from 0...',
			);
		}
	}
} catch (error) {
	logger.warn('Failed to load hostname counter, starting from 0...', {
		error: error instanceof Error ? error.message : String(error),
	});
}

const persistMetaDataHostnameCounter = () => {
	try {
		writeFileSync(metaDataCounterPath, `${metaDataHostnameCounter}`, 'utf8');
	} catch (error) {
		logger.error('Failed to persist hostname counter.', {
			error: error instanceof Error ? error.message : String(error),
		});
	}
};

const metaDataInstanceAssignments = new Map();
let shouldPersistLoadedAssignments = false;
try {
	if (existsSync(metaDataAssignmentsPath)) {
		const rawAssignments = readFileSync(metaDataAssignmentsPath, 'utf8').trim();
		if (rawAssignments.length > 0) {
			const parsedAssignments = JSON.parse(rawAssignments);
			if (parsedAssignments && typeof parsedAssignments === 'object') {
				for (const [key, value] of Object.entries(parsedAssignments)) {
					if (
						value &&
						typeof value === 'object' &&
						typeof value.instanceId === 'string' &&
						typeof value.hostname === 'string'
					) {
						const ipAddress =
							typeof value.ipAddress === 'string' && value.ipAddress.length > 0
								? value.ipAddress
								: deriveIpAddressFromHostname(value.hostname);
						if (typeof value.ipAddress !== 'string' || value.ipAddress.length === 0) {
							shouldPersistLoadedAssignments = true;
						}
						metaDataInstanceAssignments.set(key, {
							instanceId: value.instanceId,
							hostname: value.hostname,
							ipAddress,
						});
					}
				}
			}
		}
	}
} catch (error) {
	logger.warn('Failed to load instance assignments, starting empty...', {
		error: error instanceof Error ? error.message : String(error),
	});
}

const persistMetaDataInstanceAssignments = () => {
	try {
		const serializedAssignments = Object.fromEntries(
			metaDataInstanceAssignments.entries(),
		);
		writeFileSync(
			metaDataAssignmentsPath,
			JSON.stringify(serializedAssignments),
			'utf8',
		);
	} catch (error) {
		logger.error('Failed to persist instance assignments.', {
			error: error instanceof Error ? error.message : String(error),
		});
	}
};

if (shouldPersistLoadedAssignments) {
	persistMetaDataInstanceAssignments();
}

const logGeneratedInstance = (instanceId, hostname, ipAddress) => {
	const logLine = `${new Date().toISOString()} instance-id=${instanceId} hostname=${hostname} ip-address=${ipAddress}\n`;
	appendFile(generatedInstancesLogPath, logLine, (error) => {
		if (error) {
			logger.error('Failed to log generated instance.', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});
};

const getOrCreateAssignment = (clientIdentifier) => {
	let assignment = metaDataInstanceAssignments.get(clientIdentifier);
	if (assignment) {
		logger.info('Found existing instance assignment.', { clientIdentifier, assignment });
		if (typeof assignment.ipAddress !== 'string' || assignment.ipAddress.length === 0) {
			const updatedAssignment = {
				...assignment,
				ipAddress: deriveIpAddressFromHostname(assignment.hostname),
			};
			metaDataInstanceAssignments.set(clientIdentifier, updatedAssignment);
			persistMetaDataInstanceAssignments();
			assignment = updatedAssignment;
		}
	} else {
		logger.info('No existing instance assignment found. Generating new one.', {
			clientIdentifier,
		});
		const instanceId = randomUUID();
		const hostIndex = metaDataHostnameCounter;
		const hostnameSuffix = hostIndex.toString().padStart(2, '0');
		metaDataHostnameCounter += 1;
		persistMetaDataHostnameCounter();
		const hostname = `server-${hostnameSuffix}`;
		const ipAddress = computeStaticIpAddress(hostIndex);
		assignment = { instanceId, hostname, ipAddress };
		metaDataInstanceAssignments.set(clientIdentifier, assignment);
		persistMetaDataInstanceAssignments();
		logGeneratedInstance(instanceId, hostname, ipAddress);
	}
	return assignment;
};

let simpleId = 0;
app.use(function (request, _, next) {
	request.simpleId = simpleId++;
	next();
});
app.use(function (request, response, next) {
	logger.info('received request', {
		request: {
			id: request.simpleId,
			url: request.url,
			protocol: request.protocol,
			hostname: request.hostname,
			method: request.method,
			ip: request.ip,
		},
	});
	response.on('finish', () => {
		logger.info('sent response', {
			requestId: request.simpleId,
			response: {
				statusCode: response.statusCode,
			},
		});
	});
	next();
});
app.use(function (error, request, _, next) {
	logger.error('error handling request', {
		requestId: request.simpleId,
		error: JSON.stringify(error),
	});
	next();
});

app.get('/cloud-init/v1/user-data', (_, response) => {
	response.type('text/plain').send(userDataContent);
});

app.get('/cloud-init/v1/vendor-data', (_, response) => {
	response.type('text/plain').send('');
});

app.get('/cloud-init/v1/meta-data', (request, response) => {
	const { instanceId, hostname, ipAddress } = getOrCreateAssignment(request.ip);
	const metaDataBody = metaDataTemplate
		.replace(/instance-id: .*/g, `instance-id: ${instanceId}`)
		.replace(/local-hostname: .*/g, `local-hostname: ${hostname}`)
		.replace(/hostname: .*/g, `hostname: ${hostname}`)
		.replace(
			/(addresses:\s*\[)(\d+\.\d+\.\d+\.\d+)(\/\d+])/,
			`$1${ipAddress}$3`,
		);
	response.type('text/plain').send(metaDataBody);
});

app.get('/cloud-init/v2/:vmgenId/:dmiUuid/user-data', (_, response) => {
	response.type('text/plain').send(userDataContent);
});
app.get('/cloud-init/v2/:vmgenId/:dmiUuid/vendor-data', (_, response) => {
	response.type('text/plain').send('');
});
app.get('/cloud-init/v2/:vmgenId/:dmiUuid/meta-data', (request, response) => {
	const { vmgenId, dmiUuid } = request.params;
	const { instanceId, hostname, ipAddress } = getOrCreateAssignment(`${vmgenId}:${dmiUuid}`);
	const metaDataBody = metaDataTemplate
		.replace(/instance-id: .*/g, `instance-id: ${instanceId}`)
		.replace(/local-hostname: .*/g, `local-hostname: ${hostname}`)
		.replace(/hostname: .*/g, `hostname: ${hostname}`)
		.replace(
			/(addresses:\s*\[)(\d+\.\d+\.\d+\.\d+)(\/\d+])/,
			`$1${ipAddress}$3`,
		);
	response.type('text/plain').send(metaDataBody);
});

app.get('/cloud-init/v3/:vmgenId/:vmName/user-data', (_, response) => {
	response.type('text/plain').send(userDataContent);
});
app.get('/cloud-init/v3/:vmgenId/:vmName/vendor-data', (_, response) => {
	response.type('text/plain').send('');
});
app.get('/cloud-init/v3/:vmgenId/:vmName/meta-data', (request, response) => {
	const { vmgenId, vmName } = request.params;
	const clientIdentifier = `${vmgenId}:${vmName}`;
	const { instanceId, ipAddress } = getOrCreateAssignment(clientIdentifier);
	const metaDataBody = metaDataTemplate
		.replace(/instance-id: .*/g, `instance-id: ${instanceId}`)
		.replace(/local-hostname: .*/g, `local-hostname: ${vmName}`)
		.replace(/hostname: .*/g, `hostname: ${vmName}.home.arpa`)
		.replace(
			/(addresses:\s*\[)(\d+\.\d+\.\d+\.\d+)(\/\d+])/,
			`$1${ipAddress}$3`,
		);
	response.type('text/plain').send(metaDataBody);
});

// Catch-all for other routes
app.use((_, response) => {
	response.status(404).type('text/plain').send('Not Found');
});

let server;
if (insecure) {
	server = app.listen(port, () => {
		logger.info(`Insecure http server listening on port ${port}`);
	});
} else {
	const serverTlsCertificate = process.env.server_tls_certificate;
	const serverTlsPrivateKey = process.env.server_tls_private_key;
	const serverOptions = {
		cert: serverTlsCertificate,
		key: serverTlsPrivateKey,
		maxVersion: 'TLSv1.3',
		minVersion: 'TLSv1.2',
	};

	server = https.createServer(serverOptions, app).listen(port, () => {
		logger.info(`Https server listening on port ${port}`);
	});
}

server.on('error', (error) => {
	logger.error('The server encountered an error.', error);
	// process.exit(1);
});
