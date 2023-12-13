FROM node:21

# Setting up the work directory
WORKDIR /app

# Copying all the files in the project
COPY . .

# Install dependencies
RUN npm install

# Set an environmental variable
ENV IS_DOCKER_ENVIRONMENT=true

# Expose node ports
EXPOSE 80

# Start the node
CMD [ "node", "node.js" ]