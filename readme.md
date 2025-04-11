# Host Provisioning Service

A simple web server that provides host configuration files.

## Context

A complex home network where I have control over core
hosts and services such as a firewall, dns, and
hypervisors.
Ideally, and potentially over time, this project can
accommodate more and more automation with respect to host
provisioning, as well as becoming useful to more contexts.

## Motivation

I want completely touchless, automated provisioning of hosts
on my home network.
This means, at a minimum, I need to automate:

1. Installing the operating system.
2. Configuring the operating system so that it is accessible
   over the network for further customization.

> [!NOTE]
> The astute reader will recognize that, even with a
> hypervisor, there are many steps that precede (1), and
> many of those are likely to be manual. These are out of
> scope for now, but I do intend to address them over time,
> whether in this project or elsewhere.

One of the easier ways to accomplish at least part of (1)
and all of (2) is by using
[cloud-init](https://cloudinit.readthedocs.io/en/latest/index.html).
This project has an https(s) server implementation to serve
configuration files over the network as part of cloud-init's
protocol.
New hosts that support cloud-init can be directed to this
server on first boot in order to retrieve configuration
files.
See the cloud-init documentation on the
[NoCloud data source](https://cloudinit.readthedocs.io/en/latest/reference/datasources/nocloud.html)
and how to use it via discovery configuration.
Unfortunately, the easiest method of discovery configuration
still requires modifying the installation image (.iso file).

TODO: Provide full notes on this process, perhaps via
my first blog post.

## Prerequesites

To run directly via Nodejs:

- Nodejs (including `npm`)

To run via container:

- A container runtime such as Podman, Colima, Docker.

For https (the default--because _securitay_):

- A server tls certificate.
- A server tls private key corresponding to the certificate.
- A certificate authority public certificate to give to
  clients so they will trust and accept the server
  certificate.

TODO: Include instructions on how to generate certificates.
TODO: Determine if cloud-init accepts certificates from a
private authority for authenticating data sources.

## Usage

### Configure

#### Content

The whole point of this is to send cloud-init configuration
files, so you must write your own and put them in the
[content](./content) directory.
I have provided sample files in the [examples](./examples/)
directory, but they are likely too specific for it to make
any sense to include real-world examples.

> [!IMPORTANT]
> You must add your ssh key to the
> [user-data](./content/user-data) file or otherwise
> modify/replace the files to suit your needs. Otherwise
> you will likely end up with a failed operating system
> installation or a useless one (since you won't be able
> to access it).

The basic structure should look like this:

```
content/
├── meta-data
└── user-data
```

#### Environment

`port` to bind to. Default 443.

`server_tls_certificate` holds the _contents_ of the
certificate. Required for https.

`server_tls_private_key` holds the private key
corresponding to the certificate. Required for https.

`insecure` set to `true` to have the server communicate
using http instead of https.

### Run

```shell
git clone git@github.com:kyle-blair/host-provisioning-service.git
cd host-provisioning-service
```

#### Local/Direct/Development

```shell
npm install
# The default port 443 requires elevated permission.
# Use 10000 for now.
export port=10000
export server_tls_certificate=$(cat /path/to/certificate.pem)
export server_tls_private_key=$(cat /path/to/private-key.pem)
npm start
```

#### Container

TODO: Implement and test containerfile and container-compose.

```shell
# Something like this
docker-compose up --build container-compose.yaml
```

#### Try it

```shell
curl https://localhost/cloud-init/v1/user-data
```
