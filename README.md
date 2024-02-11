<img src="https://github.com/cconley717/MoarTube-Node/assets/26640616/2dacfc1c-dbd0-4c71-b9a5-b11ac67d290f" alt="logo" width="200"/>

# MoarTube-Node
A repository containing the MoarTube Node software, a cross-platform terminal-based Node.js Express application, managed by the [MoarTube Client](https://github.com/cconley717/MoarTube-Client). Share your node's videos with [MoarTube](https://www.moartube.com) or do your own thing and run your node privately. MoarTube makes video and live streaming so easy you'll be amazed beyond belief.

# How to Get Started
MoarTube Node can be found on [DockerHub](https://hub.docker.com/r/moartube/moartube-node) and can be managed with software like [Docker Desktop](https://www.docker.com/products/docker-desktop/), or follow the manual approach to start your node. When ready, head over to [MoarTube Client](https://github.com/cconley717/MoarTube-Client) if you haven't yet.

If you're using Docker from the command line, the following command pulls the latest MoarTube Node image, creates a container from it called moartube-node-1, assigns it port 8181, and sets it to run in the background. It'll auto-restart if it was not stopped by you; it will auto-start when the Docker daemon starts, such as on system boot if the Docker daemon is configured to start on system boot.

**docker run -d --restart unless-stopped -p 8181:80 --name moartube-node-1 moartube/moartube-node:latest**

*note: the Docker container uses [**/data**](https://github.com/cconley717/MoarTube-Node/blob/master/Dockerfile#L19) for its volume container path.*

The default login credentials for your node are below. Be sure to change these upon logging in.

**username**: admin<br/>**password**: admin

# Features
 - Cross platform support for Windows/macOS/Linux
 - Admin panel for managing videos and live streams
 - Video on demand (VoD) and HLS live streaming
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
 - Publicize your node's content on [MoarTube](http://www.moartube.com) or run your node privately
 - [Dual box compatible](https://moartu.be/nodes/chris_moartube_node/videos/f7w9spnInuN); broadcast an RTMP stream with software such as OBS from a primary system over a network (WAN or LAN) to a secondary system running the MoarTube Client, separating stream broadcasting from stream processing. This is achieved without any special plugins, such as NDI.
 - [Cloudflare Turnstile](https://moartu.be/nodes/chris_moartube_node/videos/gQcsrSmsmrY); next-generation bot detection and human verification without the annoyance of captcha.
 - [Cloudflare one-click integration](https://moartu.be/nodes/chris_moartube_node/videos/9aP6aY4DYeH); easily integrate your node into the [Cloudflare Network](https://www.cloudflare.com/network/), allowing for global media delivery capabilities of your videos and live streams that rivals major platforms, all from a single node. Features automated caching strategy configuration and automated cache management, and of course the best security from the world's leading CDN.

![image](https://github.com/cconley717/MoarTube-Client/assets/26640616/0d8ac95f-f68b-4e36-849e-28139b45ce50)

![image](https://github.com/cconley717/MoarTube-Client/assets/26640616/918aa074-b6e2-49f1-8d14-5c2ed1bcd582)

![image](https://github.com/cconley717/MoarTube-Client/assets/26640616/068ec86b-a3d8-4285-9b64-4b71f64cce41)

# Manual Approach

## (Ubuntu Linux, Digital Ocean) (automated)

Run the command ***bash <(wget -O - https://www.moartube.com/bash/install/node)***

Your MoarTube node is now ready! :tada:

## (Ubuntu Linux, Digital Ocean) (manual)

Run the command **sudo snap install node --classic --channel=21**

**git clone** the MoarTube-Node repository

Open a terminal within the MoarTube-Node directory

Run the command **npm install**

Run the command **node node.js**

### Ubuntu Autostart Guide

Stop the Moartube Node software if it is running

Run the command **sudo nano /etc/systemd/system/moartube-node.service**

Below is an example of a moartube-node systemd service unit file

Make any necessary changes and paste it into the nano text editor

```
[Unit]
Description=MoarTube Node
After=network.target

[Service]
Type=simple
User=root
ExecStart=/snap/bin/node /home/Moartube-Node/node.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Run the command **sudo systemctl daemon-reload** to reload all services

Run the command **sudo systemctl enable moartube-node** to make the moartube-node service autostart on system boot

Run the command **sudo systemctl start moartube-node** to start the moartube-node service

Run the command **sudo systemctl status moartube-node** to view the status of the moartube-node service

#### some commands of interest

Run the command **sudo systemctl stop moartube-node** to stop the moartube-node service

Run the command **sudo systemctl restart moartube-node** to restart the moartube-node service
