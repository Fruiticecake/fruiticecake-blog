---
title: docker部署vue3+express到服务器
date: 2020-01-01
summary: express的dockerfile FROM node WORKDIR /app COPY ./package.json /app/ RUN npm install COPY . /app/ EXP…
tags: [CSDN同步, docker, 容器]
slug: 128324263-docker部署vue3-express到服务器
source: https://blog.csdn.net/weixin_52400878/article/details/128324263
---

express的dockerfile

```
FROM node

WORKDIR /app

COPY ./package.json /app/

RUN npm install

COPY . /app/

EXPOSE 3000

CMD node app.js
```

vue部分的dockerfile

```
FROM nginx
EXPOSE 3010
COPY /dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
```

其中default.conf文件内容为:

```
server {
    listen       3010;
    listen	 [::]:3010;
    server_name  localhost;

    access_log  /var/log/nginx/host.access.log  main;

    location / {
        root   /usr/share/nginx/html;
        index  index.html index.htm;
    }

    location ^~ /prod-api/ {              
	    proxy_pass http://xxx.xx.xx.x:xxx/;//express运行的服务器地址  
    }

    #error_page  404              /404.html;
    # redirect server error pages to the static page /50x.html
  
    error_page   500 502 503 504  /50x.html;
    location = /50x.html {
       root   /usr/share/nginx/html;
    }
}

```

docker拉取的nginx镜像默认配置，需要自行写一个配置去覆盖。

## 一些坑

我是在MacOs上开发的，docker打包的会默认为你当前运行环境。所以本地测试通过放在linux服务器会无法跑，甚至容器都无法启动。要添加制定版本去打包镜像。

```
docker build --platform linux/amd64 -t gorker-vue3-linux:latest .   
```

使用了element-plus中的Menu菜单作为Aside布局。其中:default-active属性起初为这么写的

```
  <el-menu
    class="el-menu-vertical-demo"
    text-color="#ffffff"
    active-text-color="#ffd04b"
    background-color="#5a3fba"
    :collapse="isCollapse"
    :default-active="this.$route.path"
    :router="true"
  >
</el-menu>
```

在本地运行无问题，打包到服务器上会报错 Cannot read properties of undefined (reading '$route')

解决方案为将this删除即修改为

```
  <el-menu
    class="el-menu-vertical-demo"
    text-color="#ffffff"
    active-text-color="#ffd04b"
    background-color="#5a3fba"
    :collapse="isCollapse"
    :default-active="$route.path"
    :router="true"
  >
</el-menu>
```

> 原载 [CSDN](https://blog.csdn.net/weixin_52400878/article/details/128324263)，同步至本站。
