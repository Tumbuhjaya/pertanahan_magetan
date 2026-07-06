FROM node:18-alpine

WORKDIR /app

# Install app dependencies
RUN apk add --no-cache python3 make g++
RUN apk add --no-cache curl
COPY package.json .
COPY package-lock.json .
COPY ecosystem.config.js .

RUN npm ci

# Bundle APP files
COPY src src/

# Folder Not exists
# COPY public public/

# Expose the listening port of your app
EXPOSE 8919

# Show current folder structure in logs
#RUN ls -al -R

CMD ["node", "src/app.js"]
