# Minimal Linux image with gcc for compiling C bots
FROM alpine:3.19

# Install gcc and necessary build tools
RUN apk add --no-cache gcc musl-dev

# Create a non-root user for running bots (security)
RUN adduser -D -s /bin/sh botrunner

# Set working directory
WORKDIR /sandbox

# Switch to non-root user
USER botrunner