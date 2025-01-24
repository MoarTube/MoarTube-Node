<img src="https://github.com/MoarTube/MoarTube-Node/assets/26640616/2dacfc1c-dbd0-4c71-b9a5-b11ac67d290f" alt="logo" width="200"/>

# MoarTube-Node
A repository containing the MoarTube Node software, a cross-platform terminal-based Node.js Express application, managed by the [MoarTube Client](https://github.com/MoarTube/MoarTube-Client). Share your node's videos with [MoarTube](https://www.moartube.com) or do your own thing and run your node privately. MoarTube makes video and live streaming so easy you'll be amazed beyond belief.

[TL;DR: quickstart video](https://www.moartube.com/guides/moartube-quick-start)

# How to Get Started
Welcome to the MoarTube Node setup guide! This document will guide you through the different setup methods to get your MoarTube Node up and running. Don't worry! MoarTube is so easy to set up and use, you'll be done in minutes. When ready, head over to [MoarTube Client](https://github.com/MoarTube/MoarTube-Client) if you haven't yet.

# Table of Contents
- [Features](#features)
- [System Requirements](#system-requirements)
- [Prerequisites](#prerequisites)
  - [Docker](#docker)
  - [npm](#npm)
  - [git](#git)
  - [script (Ubuntu Linux)](#script-ubuntu-linux)
- [Installation Methods](#installation-methods)
  - [Docker](#dockerhub)
  - [npm](#npm-1)
  - [git](#git-1)
  - [script (Ubuntu Linux)](#script-ubuntu-linux-1)
- [Next Steps](#next-steps)
  - [Default Login Credentials](#default-login-credentials)
  - [Cloudflare](#cloudflare)
  - [Get MoarTube Client](#get-moartube-client)
- [Guides](#guides)
  - [Ubuntu Linux Node.js install Guide](#ubuntu-linux-nodejs-install-guide)
  - [Ubuntu Linux Autostart Guide](#ubuntu-linux-autostart-guide)

# Features
## 🖥️ Platform Support
- Cross-platform compatibility: **Windows**, **macOS**, and **Linux**
- Capable of running on a **[Raspberry Pi Zero 2 W](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/)**
- Run your node **Privately** or **publicize** your videos and streams on [MoarTube](http://www.moartube.com)
- MoarTube Client performs video and stream processing on your local machine
- MoarTube Node handles storage and distribution of your content
- Host your node:
  - **On the cloud**
  - **On your home WiFi**

## 📹 Video & Streaming Features
- **Video on Demand (VoD)** and **HLS Live Streaming**
- Supported formats:
  - **HLS** *(H.264, AAC)*
  - **MP4** *(H.264, AAC)*
  - **WEBM** *(VP9, Opus)*
  - **OGV** *(VP8, Opus)*
- Transcoding capabilities:
  - Convert **MP4/WEBM** videos to **HLS/MP4/WEBM/OGV**
  - Transcode **RTMP streams** ([e.g., from OBS](https://www.moartube.com/guides/how-to-live-stream-obs)) into **HLS live streams**
- Video resolutions: **2160p**, **1440p**, **1080p**, **720p**, **480p**, **360p**, **240p**
- Video player modes:
  - **Streamer Mode**
  - **Theater Mode**
  - **Fullscreen Mode**
- **Anonymous Comments & Live Stream Chat**:
  - Foster engagement while maintaining user privacy

## 💾 Data Processing & Storage
- Database 
  - Use a local **SQLite database**
  - Decentralize your node with a remote **Postgres database**
- Storage
  - **File system** to store your videos and live streams on your node
  - **S3-compatible provider** to store your videos and live streams in the cloud

## ⚙️ Admin & Moderation
- **Admin Panel**
  - Managing videos and live streams
- **Reports Section**:
  - Track and moderate comments and videos
- **Comment Monitoring Overview**:
  - Includes moderation tools

## 💵 Monetization & Promotion
- Monetization via cryptocurrency:
  - Accept **ETH** and **BNB** via MetaMask
- Promote your node by providing links to:
  - **Social media platforms**
  - **Websites**
  - **External platforms**

## 🛠️ Advanced Features
- [**Cloudflare CDN**](https://www.moartube.com/guides/how-to-enable-cloudflare-cdn):
  - Cloudflare's **global** network facilitates data propagation for audiences of any size, anywhere
- [**Cloudflare Turnstile**](https://www.moartube.com/guides/how-to-enable-cloudflare-turnstile):
  - Next-generation bot detection and human verification without intrusive captchas
- [**HTTPS/WSS support**](https://www.moartube.com/guides/how-to-secure-https)
  - secure communications
- [**Dual Box Compatibility**](https://www.moartube.com/guides/how-to-dual-box):
  - Use your system to broadcast an RTMP stream from OBS to another system for processing running MoarTube Client (no plugins like NDI required)
- [**GPU Acceleration**](https://www.moartube.com/guides/how-to-enable-gpu-acceleration):
  - Supports **Nvidia** and **AMD** GPUs for accelerated encoding/decoding (Windows only)
- **database config**
- **storage config**



## 🏆 Why Choose MoarTube?
MoarTube empowers you to take control of your media hosting with privacy, decentralization, and robust features designed to rival major platforms—all while remaining lightweight, accessible, and cost-effective, all from a single node.


![image](https://github.com/MoarTube/MoarTube-Client/assets/26640616/0d8ac95f-f68b-4e36-849e-28139b45ce50)

![image](https://github.com/MoarTube/MoarTube-Client/assets/26640616/918aa074-b6e2-49f1-8d14-5c2ed1bcd582)

![image](https://github.com/MoarTube/MoarTube-Client/assets/26640616/068ec86b-a3d8-4285-9b64-4b71f64cce41)

## System Requirements

Node.js is the only requirement to run a MoarTube Node, and all major operating systems support it.

MoarTube Node has the smallest resource usage footprint out of any self-hosted video and live streaming solution available today; most of the heavy computational responsibilities and memory-intensive operations are handled by MoarTube Client; MoarTube Node is only responsible for storage and distribution. MoarTube Node is also multi-threaded, utilizing the full potential of the CPU of whatever system it is installed on.

On Digital Ocean, an $8 VPS (1 vCPU, 1 GB RAM) provides a comfortable headroom to handle surprisingly moderate demand. Although this tier is likely adequate for most users, others will need to observe the resource usage monitor and adjust their instance accordingly. Or just simply forget all that and [host from your personal computer over home WiFi](https://www.moartube.com/guides/how-to-run-node-on-home-wifi).

The node software uses about 100MB of RAM while sitting idle with fluctuations depending on visitor (and user) demand. Much of the demand can be alleviated by the [Cloudflare integration](https://www.moartube.com/guides/how-to-enable-cloudflare-integration) feature, leveraging the world's largest CDN to distribute your video and live stream data, giving your node capabilities that rival that of major platforms.

To give you an idea of how tiny MoarTube Node really is, the software can run on a [Raspberry Pi Zero 2 W](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/) on Raspberry Pi OS with approximately 100MB of system RAM remaining out of a total system availability of 512MB; the OS uses about 200MB RAM and reserves an additional 100MB for a swap file.

As you can see, MoarTube Node is quite capable and can run on just about anything, anywhere.

Node.js v20 and later required.

## Prerequisites

Observe the corresponding prerequisite for your installation method.

### Docker
If you're using Docker, make sure that it is installed on your machine.

### npm
If you're using npm to install the software, make sure that [Node.js and npm](https://nodejs.org/en) are installed on your machine.

### git
You can clone the repo, but make sure that [Node.js and npm](https://nodejs.org/en) are installed on your machine.

### script (Ubuntu Linux)

A script to automate your entire setup. Installs Node.js using Snap, clones the git repo using git, installs dependencies using npm, and sets the node to autostart on system boot using systemctl

## Installation Methods

Choose any of the following installation methods.

### [DockerHub](https://hub.docker.com/r/moartube/moartube-node/tags)

MoarTube Node is available on DockerHub and can be easily set up using Docker Desktop or via the command line for a more manual approach.

#### Using [Docker Desktop](https://www.docker.com/products/docker-desktop/)

You can manage MoarTube Node using Docker Desktop by searching for `moartube/moartube-node` on DockerHub within the Docker Desktop interface.

#### Manual Docker Setup

To set up MoarTube Node manually using Docker, execute the following command in your terminal. This command pulls the latest MoarTube Node image, creates a container named `moartube-node-1`, assigns it port 8181, and configures it to auto-restart unless manually stopped.

##### For x86-64 architecture: 
```bash
docker run --platform linux/amd64 -d --restart unless-stopped -p 8181:80 --name moartube-node-1 moartube/moartube-node:latest
```

##### For ARM64 architecture: 
```bash
docker run --platform linux/arm64 -d --restart unless-stopped -p 8181:80 --name moartube-node-1 moartube/moartube-node:latest
```

*note: the Docker container uses [**/data**](https://github.com/MoarTube/MoarTube-Node/blob/master/Dockerfile#L19) for its volume container path.*

### [npm](https://www.npmjs.com/package/@moartube/moartube-node)
You can install MoarTube Node globally:

```bash
npm i @moartube/moartube-node -g
```

And run from the command-line globally:

```bash
moartube-node
```

<br>

You can install MoarTube Node locally:

```bash
npm i @moartube/moartube-node
```

And run from the command-line locally:

```bash
node node_modules/@moartube/moartube-node/moartube-node.js
```

### [git](https://github.com/MoarTube/MoarTube-Node)

```bash
git clone https://github.com/MoarTube/MoarTube-Node
```

Open a terminal in the cloned directory and run:

```bash
npm install
```

```bash
node moartube-node.js
```

### [script (Ubuntu Linux)](https://www.moartube.com/bash/install/node)

```bash
bash <(wget -O - https://www.moartube.com/bash/install/node)
```

## Next Steps

### Default Login Credentials

The default login credentials for your node are below. Be sure to change these upon logging in.

By default, MoarTube Node listens on port 80.

**username**: admin<br/>**password**: admin

### Cloudflare

At this point, you should probably look into creating a free [Cloudflare account](https://www.cloudflare.com/network/) so that you can [give your node CDN capabilities](https://www.moartube.com/guides/how-to-enable-cloudflare-integration). With over 300 data centers worlwide, Cloudflare will distribute most of your node's videos and live streams.

### Get MoarTube Client

If you haven't already, it's time to get the [MoarTube Client](https://github.com/MoarTube/MoarTube-Client).

## Guides

### Ubuntu Linux Node.js Install Guide

Ubuntu Linux comes pre-installed with the Snap package manager. It's the easiest way to install Node.js.

Run the command:
```bash
sudo snap install node --classic --channel=21
```

### Ubuntu Linux Autostart Guide

This guide will configure your node to autostart on system boot.

Stop the Moartube Node software if it is running

Run the command:
```bash
sudo nano /etc/systemd/system/moartube-node.service
```

Below is an example of a moartube-node systemd service unit file

Make any necessary changes and paste it into the nano text editor

```
[Unit]
Description=MoarTube Node
After=network.target

[Service]
Type=simple
User=root
ExecStart=/snap/bin/node /home/Moartube-Node/moartube-node.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Reload all services.

```bash
sudo systemctl daemon-reload
```

Make the moartube-node service autostart on system boot.

```bash
sudo systemctl enable moartube-node
```

Start the moartube-node service.

```bash
sudo systemctl start moartube-node
```

View the status of the moartube-node service

```bash
sudo systemctl status moartube-node
```


#### some commands of interest

Stop the moartube-node service.

```bash
sudo systemctl stop moartube-node
```

Restart the moartube-node service.

```bash
sudo systemctl restart moartube-node
```





