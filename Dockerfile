FROM node:21

# Setting up the work directory
WORKDIR /moartube-node

# Copying all the files in the project
COPY . .

# Install dependencies
RUN npm install

# Set an environmental variable
ENV IS_DOCKER_ENVIRONMENT=true

# Expose node ports
EXPOSE 80

# Create the volume
VOLUME /data

# Start the node
CMD [ "node", "node.js" ]