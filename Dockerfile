FROM node:20.20.0-alpine as frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

FROM python:3.10-slim

WORKDIR /app

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/

COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8000

WORKDIR /app/backend
CMD ["python", "main.py"]
