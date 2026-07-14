---
title: "从0到1：基于Vue3+Express+MySQL的课程管理系统（附ER图+Docker-Compose配置）"
date: 2023-05-09
summary: "vue3+express+Mysql（含ER图）+docker实现一个课程管理系统服务端：vue3后端：express数据库：Mysql部署：docker；也可以采用github page白嫖。"
tags: ["CSDN同步", "express", "mysql", "docker", "vue", "vue.js"]
slug: 130587499-从0到1-基于vue3-express-mysql的课程管理系统-附er图-docker-compose配置
source: "https://blog.csdn.net/weixin_52400878/article/details/130587499"
---

vue3+express+Mysql（含ER图）+docker实现一个课程管理系统

服务端：vue3
后端：express
数据库：Mysql
部署：docker；也可以采用github page白嫖

https://github.com/Fruiticecake/Course-vue(觉得不错的话就点颗星星吧~)

# Course-vue
- Gorker管理系统 个人全栈项目
- 框架为 vue3+express+Mysql
- 跨域 cors


# 使用docker部署
- 体验 http://119.23.73.9:3010  版本为2022/12/15
- 前后端分离部署。服务器是centOs，所以单独打包的linux版本
- 前端：docker pull fruiticecake/gorker-vue3-linux:latest
- 服务端：docker pull fruiticecake/gorker-express-linux:latest
## 若需要修改后docker部署
- 要修改courseweb/nginx/default.conf文件中 proxy_pass 后为要部署的服务器地址。
# 本地运行
- 数据库连接用dotenv的全局变量，需自行在根目录下创建.env文件配置相关数据库信息。
# 数据库
- 数据库sql在server文件中。
## ER图
![在这里插入图片描述](https://i-blog.csdnimg.cn/blog_migrate/4890b0cb9a89f0aedb8422a75139cf48.png)

# 界面演示（未更新）
![Snipaste_2022-11-14_01-11-13](https://i-blog.csdnimg.cn/blog_migrate/43f659731d153712855a74d6e83ff69e.png)


![Snipaste_2022-11-14_01-11-42](https://i-blog.csdnimg.cn/blog_migrate/6ba0b584a3deaddc315895e2906bd6be.png)

> 原文发布于 [CSDN](https://blog.csdn.net/weixin_52400878/article/details/130587499)
