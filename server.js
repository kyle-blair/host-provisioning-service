import express from 'express';
import path, { dirname } from 'node:path';
import https from 'node:https';
import winston from 'winston';
import { fileURLToPath } from 'node:url';

const logger = winston.createLogger({
	level: 'info',
	format: winston.format.json(),
	transports: [new winston.transports.Console()],
});
logger.info('Attempting to start the host-provisioning-service.');

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

if (
	insecure === false &&
	(process.env.serverTlsCertificate === undefined ||
		process.env.serverTlsPrivateKey === undefined)
) {
	logger.error(
		'serverTlsCertificate and serverTlsPrivateKey are ' +
			'required for secure connections. Before running the server, ' + 
			'export the environment variables (for example ' +
			'`export serverTlsCertificate="$(cat /path/to/cert.pem)"`). Alternatively, ' +
			'set insecure to true (not recommended).',
	);
	process.exit(1);
}

logger.info('configuration after processing:');
logger.info(`insecure: ${insecure}`);
logger.info(`port: ${port}`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
app.use('/cloud-init/v1', express.static(path.join(__dirname, 'content')));

let server;
if (insecure) {
	server = app.listen(port, () => {
		logger.info(`Insecure http server listening on port ${port}`);
	});
} else {
	const serverOptions = {
		cert: serverTlsCertificate,
		key: serverTlsPrivateKey,
		enableTrace: true,
	};

	server = https.createServer(serverOptions, app).listen(port, () => {
		logger.info(`Https server listening on port ${port}`);
	});
}
