<img src="https://github.com/MoarTube/MoarTube-Node/assets/26640616/2dacfc1c-dbd0-4c71-b9a5-b11ac67d290f" alt="logo" width="200"/>

# MoarTube-Node
A repository containing the MoarTube Node software, a cross-platform terminal-based Node.js Express application, managed by the [MoarTube Client](https://github.com/MoarTube/MoarTube-Client). Share your node's videos with [MoarTube](https://www.moartube.com) or do your own thing and run your node privately. MoarTube makes video and live streaming so easy you'll be amazed beyond belief.

# How to Get Started
Welcome to the MoarTube Node setup guide! This document will guide you through the different setup methods to get your MoarTube Node up and running. Don't worry; MoarTube is so easy to set up and use, you'll be done in minutes. When ready, head over to [MoarTube Client](https://github.com/MoarTube/MoarTube-Client) if you haven't yet.

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
  - [Docker](#docker)
  - [npm](#npm)
  - [git](#git)
  - [script (Ubuntu Linux)](#script-ubuntu-linux-1)
- [Next Steps](#next-steps)
  - [Default Login Credentials](#default-login-credentials)
  - [Cloudflare](#cloudflare)
  - [Get MoarTube Client](#get-moartube-client)
- [Guides](#guides)
  - [Ubuntu Linux Autostart Guide](#ubuntu-linux-autostart-guide)

## Features
 - Cross platform support for Windows/macOS/Linux
 - Video on demand (VoD) and HLS live streaming
 - Admin panel for managing videos and live streams
 - **HLS** *(H.264, AAC)*, **MP4** *(H.264, AAC)*, **WEBM** *(VP9, Opus)*, **OGV** *(VP8, Opus)* container formats
 - Transcode static MP4/WEBM video to HLS/MP4/WEBM/OGV
 - Transcode RTMP stream ([such as from OBS](https://moartu.be/nodes/chris_moartube_node/videos/e9p_nivxkX7)) to HLS live stream
 - Video output resolutions: 2160p, 1440p, 1080p, 720p, 480p, 360p, 240p
 - No server-side encoding; client-side only
 - [HTTPS/WSS](https://moartu.be/nodes/chris_moartube_node/videos/L9qCCrsMtJl) capabilities
 - [GPU acceleration](https://moartu.be/nodes/chris_moartube_node/videos/X3xL5oPTJaz) for Nvidia and AMD (Windows only)
 - Different video player modes: streamer, theater, fullscreen
 - Dark mode option and browser appearance configuration recognition
 - Anonymous video comments section and live stream chat
 - Reports section for comments and videos
 - Comment monitoring overview with moderation functionality
 - Run your node in the cloud or on your home WiFi
 - Can run on a [Raspberry Pi Zero 2 W](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/)
 - Publicize your node's content on [MoarTube](http://www.moartube.com) or run your node privately
 - [Dual box compatible](https://moartu.be/nodes/chris_moartube_node/videos/f7w9spnInuN); broadcast an RTMP stream with software such as OBS from a primary system over a network (WAN or LAN) to a secondary system running the MoarTube Client, separating stream broadcasting from stream processing. This is achieved without any special plugins, such as NDI.
 - [Cloudflare Turnstile](https://moartu.be/nodes/chris_moartube_node/videos/gQcsrSmsmrY); next-generation bot detection and human verification without the annoyance of captcha.
 - [Cloudflare one-click integration](https://moartu.be/nodes/chris_moartube_node/videos/9aP6aY4DYeH); easily integrate your node into the [Cloudflare Network](https://www.cloudflare.com/network/), allowing for global media delivery capabilities of your videos and live streams that rivals major platforms, all from a single node. Features automated caching strategy configuration and automated cache management, and of course the best security from the world's leading CDN.

![image](https://github.com/MoarTube/MoarTube-Client/assets/26640616/0d8ac95f-f68b-4e36-849e-28139b45ce50)

![image](https://github.com/MoarTube/MoarTube-Client/assets/26640616/918aa074-b6e2-49f1-8d14-5c2ed1bcd582)

![image](https://github.com/MoarTube/MoarTube-Client/assets/26640616/068ec86b-a3d8-4285-9b64-4b71f64cce41)

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

### [DockerHub](https://hub.docker.com/repository/docker/moartube/moartube-node/general)

MoarTube Node is available on DockerHub and can be easily set up using Docker Desktop or via the command line for a more manual approach.

#### Using [Docker Desktop](https://www.docker.com/products/docker-desktop/)

You can manage MoarTube Node using Docker Desktop by searching for `moartube/moartube-node` on DockerHub within the Docker Desktop interface.

#### Manual Docker Setup

To set up MoarTube Node manually using Docker, execute the following command in your terminal. This command pulls the latest MoarTube Node image, creates a container named `moartube-node-1`, assigns it port 8181, and configures it to auto-restart unless manually stopped.

```bash
docker run -d --restart unless-stopped -p 8181:80 --name moartube-node-1 moartube/moartube-node:latest
```

*note: the Docker container uses [**/data**](https://github.com/MoarTube/MoarTube-Node/blob/master/Dockerfile#L19) for its volume container path.*

### [npm](https://www.npmjs.com/settings/moartube/packages)

```bash
npm i @moartube/moartube-node
```

Open a terminal in the installation directory and run:

```bash
node node_modules/@moartube/moartube-node/moartube-node.js
```

You can also install MoarTube Node globally:

```bash
npm i @moartube/moartube-node -g
```

And run from the command-line globally:

```bash
moartube-node
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

**username**: admin<br/>**password**: admin

### Cloudflare

At this point, you should probably look into creating a free [Cloudflare account](https://www.cloudflare.com/network/) so that you can [give your node CDN capabilities](https://moartube.com/guides/how-to-integrate-your-node-with-cloudflare). With over 300 data centers worlwide, Cloudflare will distribute most of your node's videos and live streams.

### Get MoarTube Client

If you haven't already, it's time to get the [MoarTube Client](https://github.com/MoarTube/MoarTube-Client).

## Guides

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





