FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG AF_CONVERT_API=same-origin
ENV AF_CONVERT_API=$AF_CONVERT_API
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
