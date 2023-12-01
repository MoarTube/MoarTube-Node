# MoarTube-Node
A repository containing the node software for the [MoarTube platform](http://www.moartube.com).

## Setup Guide
install [Node.js](https://nodejs.org/)

clone the MoarTube-Node repository

open a terminal within the MoarTube-Node directory

run the command **npm install**

run the command **node node.js**

## Autostart Guide
run the command **sudo nano /etc/systemd/system/moartube-node.service**

below is an example of a moartube-node daemon
make any necessary changes and paste into the nano text editor

```
[Unit]
Description=MoarTube Node
After=network.target

[Service]
Type=simple
User=root
ExecStart=/snap/bin/node /home/moartube/node.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

run the command **sudo systemctl daemon-reload** to reload all daemons
run the command **sudo systemctl enable moartube-node** to make the moartube-node daemon autostart on system boot
run the command **sudo systemctl start moartube-node** to start the moartube-node daemon
run the command **sudo systemctl status moartube-node** to view the status of the moartube-node daemon
