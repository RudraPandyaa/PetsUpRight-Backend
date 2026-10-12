FROM node:20

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
# patch-package (postinstall) applies these after installing
COPY patches ./patches
RUN npm ci
COPY . .
RUN npm run build
