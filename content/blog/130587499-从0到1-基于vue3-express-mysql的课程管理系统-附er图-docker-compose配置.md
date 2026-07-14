---
title: 从0到1：基于Vue3+Express+MySQL的课程管理系统（附ER图+Docker-Compose配置）
date: 2020-01-01
summary: 该项目是一个课程管理系统，采用Vue3作为前端，Express为后端，数据库使用MySQL，已通过Docker进行部署。提供GitHub仓库链接及在线体验地址，说明了如何利用docker部署到Cent…
tags: [CSDN同步, express, docker, 服务端数据库操作全流程。主要内容包括：1)使用PHPStudy快速搭建MySQL环境及排错方法；2)C]
slug: 130587499-从0到1-基于vue3-express-mysql的课程管理系统-附er图-docker-compose配置
source: https://blog.csdn.net/weixin_52400878/article/details/130587499
---

该项目是一个课程管理系统，采用Vue3作为前端，Express为后端，数据库使用MySQL，已通过Docker进行部署。提供GitHub仓库链接及在线体验地址，说明了如何利用docker部署到CentOS服务器，并提示用户需要自定义.env文件配置数据库信息。系统包含跨域设置，数据库设计包括ER图，但界面展示可能未更新。

vue3+express+Mysql（含ER图）+docker实现一个课程管理系统

服务端：vue3 后端：express 数据库：Mysql 部署：docker；也可以采用github page白嫖

https://github.com/Fruiticecake/Course-vue(觉得不错的话就点颗星星吧~)

## Course-vue

- Gorker管理系统 个人全栈项目
- 框架为 vue3+express+Mysql
- 跨域 cors

## 使用docker部署

- 体验 http://119.23.73.9:3010 版本为2022/12/15
- 前后端分离部署。服务器是centOs，所以单独打包的linux版本
- 前端：docker pull fruiticecake/gorker-vue3-linux:latest
- 服务端：docker pull fruiticecake/gorker-express-linux:latest

### 若需要修改后docker部署

- 要修改courseweb/nginx/default.conf文件中 proxy_pass 后为要部署的服务器地址。

## 本地运行

- 数据库连接用dotenv的全局变量，需自行在根目录下创建.env文件配置相关数据库信息。

## 数据库

- 数据库sql在server文件中。

### ER图

## 界面演示（未更新）

> 原载 [CSDN](https://blog.csdn.net/weixin_52400878/article/details/130587499)，同步至本站。
