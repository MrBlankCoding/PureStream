# PureStream
Woah you can stream your screen to other people!

Thats about it.
Still working on it. 
Audio would be cool, but it's not working yet.
Also the backend could like be enhanced. 
:)

# Docker stuff
docker build -t purestream .
docker run -d -p 8000:8000 --name purestream-container purestream

# Ngok
ngrok http 8000