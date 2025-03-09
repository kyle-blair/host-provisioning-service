import express from 'express';
import path, { dirname } from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

console.log('configuration directly from environment variable values:');
console.log(`insecure: ${process.env.insecure}`);
console.log(`port: ${process.env.port}`);

const insecure = process.env.insecure || false;
const port = process.env.port || insecure ? 80 : 443;
const serverTlsCertificate = process.env.server_tls_certificate;
const serverTlsPrivateKey = process.env.server_tls_private_key;

console.log('configuration after processing:');
console.log(`insecure: ${insecure}`);
console.log(`port: ${port}`);

const serverOptions = {
	cert: serverTlsCertificate,
	key: serverTlsPrivateKey,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
app.use('/cloud-init/v1', express.static(path.join(__dirname, 'content')));

let server;
if (insecure) {
	server = app.listen(port, () => {
		console.log(`Insecure http server listening on port ${port}`);
	});
} else {
	server = https.createServer(serverOptions, app).listen(port, () => {
		console.log(`Https server listening on port ${port}`);
	});
}
