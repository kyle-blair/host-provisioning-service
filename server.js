import express from 'express';
import path, { dirname } from 'node:path';
import https from 'node:https';
import winston from 'winston';
import { fileURLToPath } from 'node:url';

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

let simpleId = 0;
app.use(function (request, response, next) {
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
app.use(function (error, request, response, next) {
	logger.error('error handling request', {
		requestId: request.simpleId,
		error: JSON.stringify(error),
	});
	next();
});
app.use('/cloud-init/v1', express.static(path.join(__dirname, 'content')));

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
