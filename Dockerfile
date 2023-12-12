FROM node:21

# Setting up the work directory
WORKDIR /app

# Copying all the files in the project
COPY . .

# Install dependencies
RUN npm install

# Set the port that the node will listen on
ENV PORT=80

# Expose node ports
EXPOSE 80 443

# Start the node
CMD [ "node", "node.js" ]