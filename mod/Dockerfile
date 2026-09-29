FROM nginx:alpine

# Másoljuk át a globális és a helyi Nginx konfigurációkat
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/default.conf

# Másoljuk át a projekt fájljait a webszerver dokumentum gyökerébe
COPY . /usr/share/nginx/html

EXPOSE 80
