
#!/bin/sh

IMAGE_NAME="$1"
IMAGE_TAG="$2"
CONTAINER_NAME="$1"

if [ -z "$IMAGE_NAME" ] || [ -z "$IMAGE_TAG" ]; then
    echo "Usage: ./docker.process.sh <image-name> <image-tag>"
    exit 1
fi

echo "Building image: ${IMAGE_NAME}:${IMAGE_TAG}"

docker build \
    -f dockerFile \
    -t "${IMAGE_NAME}:${IMAGE_TAG}" \
    .

if [ $? -ne 0 ]; then
    echo "Docker build failed."
    exit 1
fi

echo "Starting container: ${CONTAINER_NAME}"

IMAGE_NAME="$IMAGE_NAME" \
IMAGE_TAG="$IMAGE_TAG" \
CONTAINER_NAME="$CONTAINER_NAME" \
docker compose up -d

if [ $? -ne 0 ]; then
    echo "Docker Compose failed."
    exit 1
fi

echo "Container started successfully."
