---
title: "docker部署vue3+express到服务器"
date: 2022-12-15
summary: "docker部署vue3+express到服务器"
tags: ["CSDN同步", "docker", "express", "容器", "linux", "vue.js"]
slug: 128324263-docker部署vue3-express到服务器
source: "https://blog.csdn.net/weixin_52400878/article/details/128324263"
html: true
---

<p>express的dockerfile</p>

<pre>
<code class="hljs">FROM node

WORKDIR /app

COPY ./package.json /app/

RUN npm install

COPY . /app/

EXPOSE 3000

CMD node app.js</code></pre>

<p>vue部分的dockerfile</p>

<pre>
<code class="hljs">FROM nginx
EXPOSE 3010
COPY /dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf</code></pre>

<p>其中default.conf文件内容为:</p>

<pre>
<code class="hljs">server {
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
</code></pre>

<p>docker拉取的nginx镜像默认配置，需要自行写一个配置去覆盖。</p>

<h1>一些坑</h1>

<p>我是在MacOs上开发的，docker打包的会默认为你当前运行环境。所以本地测试通过放在linux服务器会无法跑，甚至容器都无法启动。要添加制定版本去打包镜像。</p>

<pre>
<code class="language-bash">docker build --platform linux/amd64 -t gorker-vue3-linux:latest .   </code></pre>

<p>使用了element-plus中的Menu菜单作为Aside布局。其中:default-active属性起初为这么写的</p>

<pre>
<code class="language-html">  &lt;el-menu
    class="el-menu-vertical-demo"
    text-color="#ffffff"
    active-text-color="#ffd04b"
    background-color="#5a3fba"
    :collapse="isCollapse"
    :default-active="this.$route.path"
    :router="true"
  &gt;
&lt;/el-menu&gt;</code></pre>

<p>在本地运行无问题，打包到服务器上会报错 Cannot read properties of undefined (reading '$route')</p>

<p>解决方案为将this删除即修改为</p>

<pre>
<code class="language-html">  &lt;el-menu
    class="el-menu-vertical-demo"
    text-color="#ffffff"
    active-text-color="#ffd04b"
    background-color="#5a3fba"
    :collapse="isCollapse"
    :default-active="$route.path"
    :router="true"
  &gt;
&lt;/el-menu&gt;</code></pre>

<p></p>
<p class="source-note">原文发布于 <a href="https://blog.csdn.net/weixin_52400878/article/details/128324263" target="_blank" rel="noopener noreferrer">CSDN</a>。</p>
