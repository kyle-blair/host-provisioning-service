#!/usr/bin/env bash

if command -v npm >/dev/null 2>&1; then
	echo "npm is installed"
else
	echo "npm is not installed. Please install Node.js and npm first."
	exit 1
fi
export port=10000
export insecure=true
npm start
