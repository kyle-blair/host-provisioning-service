import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
	existsSync,
	readFileSync,
	writeFileSync,
	unlinkSync,
} from 'node:fs';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = dirname(__dirname);
const CONTENT_DIR = join(PROJECT_ROOT, 'content');
const SERVER_ENTRY = join(PROJECT_ROOT, 'src', 'server.js');
const COUNTER_PATH = join(CONTENT_DIR, '.meta-data-hostname-counter');
const ASSIGNMENTS_PATH = join(
	CONTENT_DIR,
	'.meta-data-instance-assignments.json',
);
const LOG_PATH = join(CONTENT_DIR, 'generated-instances.log');
const PORT = 3002;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const META_DATA_URL = `${BASE_URL}/cloud-init/v3/test-suite/control-00/meta-data`;

let serverProcess;
let counterSnapshot = '';
let assignmentsSnapshot = '';
let logSnapshot = '';
let hadCounter = false;
let hadAssignments = false;
let hadLog = false;

before(async () => {
	hadCounter = existsSync(COUNTER_PATH);
	if (hadCounter) {
		counterSnapshot = readFileSync(COUNTER_PATH, 'utf8');
	}
	writeFileSync(COUNTER_PATH, '0', 'utf8');

	hadAssignments = existsSync(ASSIGNMENTS_PATH);
	if (hadAssignments) {
		assignmentsSnapshot = readFileSync(ASSIGNMENTS_PATH, 'utf8');
	}
	writeFileSync(ASSIGNMENTS_PATH, '{}', 'utf8');

	hadLog = existsSync(LOG_PATH);
	if (hadLog) {
		logSnapshot = readFileSync(LOG_PATH, 'utf8');
	}

	serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
		cwd: PROJECT_ROOT,
		env: {
			...process.env,
			port: String(PORT),
			insecure: 'true',
			NODE_ENV: 'test',
		},
		stdio: 'ignore',
	});
});

after(async () => {
	if (serverProcess && !serverProcess.killed) {
		serverProcess.kill();
		await once(serverProcess, 'exit');
	}

	await delay(50);

	if (hadCounter) {
		writeFileSync(COUNTER_PATH, counterSnapshot, 'utf8');
	} else if (existsSync(COUNTER_PATH)) {
		unlinkSync(COUNTER_PATH);
	}

	if (hadAssignments) {
		writeFileSync(ASSIGNMENTS_PATH, assignmentsSnapshot, 'utf8');
	} else if (existsSync(ASSIGNMENTS_PATH)) {
		unlinkSync(ASSIGNMENTS_PATH);
	}

	if (hadLog) {
		writeFileSync(LOG_PATH, logSnapshot, 'utf8');
	} else if (existsSync(LOG_PATH)) {
		unlinkSync(LOG_PATH);
	}
});

const fetchMetaData = async () => {
	const maxAttempts = 20;
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		try {
			const response = await fetch(META_DATA_URL);
			if (response.ok) {
				return response;
			}
		} catch (error) {
			if (attempt === maxAttempts - 1) {
				throw error;
			}
		}
		await delay(100);
	}
	throw new Error('Server did not respond to meta-data request');
};

test('meta-data returns stable assignment for vm', async () => {
	const firstResponse = await fetchMetaData();
	const firstBody = await firstResponse.text();
	assert.match(firstBody, /^instance-id: .+/m);
	assert.match(firstBody, /^local-hostname: control-00$/m);
	assert.match(firstBody, /^hostname: control-00\.home\.arpa$/m);

	const secondResponse = await fetchMetaData();
	const secondBody = await secondResponse.text();
	assert.strictEqual(secondBody, firstBody);
});
