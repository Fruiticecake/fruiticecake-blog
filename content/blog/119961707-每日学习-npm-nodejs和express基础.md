---
title: "每日学习（Npm,NodeJS和Express基础）"
date: 2020-01-01
summary: 本文介绍了Node.js的基础知识，包括其作为JavaScript运行时环境的角色，以及如何创建简单的web服务器。接着讲解了Npm包管理工具，包括package.json文件的重要性和如何管理依赖。…
tags: [CSDN同步]
slug: 119961707-每日学习-npm-nodejs和express基础
source: https://blog.csdn.net/weixin_52400878/article/details/119961707
---

本文介绍了Node.js的基础知识，包括其作为JavaScript运行时环境的角色，以及如何创建简单的web服务器。接着讲解了Npm包管理工具，包括package.json文件的重要性和如何管理依赖。最后，简述了Express框架的基本使用，展示了如何搭建一个基本的Express应用。

此系列文章用来记录我的学习历程。

今日任务:

1.了解和学习Npm包管理工具

2.Node.js和Express基础

要想学习Npm之前我们应该先弄清楚，Npm是随同NodeJS一起安装的包管理工具，所以我们应该是先学习NodeJS的知识.

### NodeJS

参考链接: Basic Node and Express - 认识 Node 的控制台 | 学习 | freeCodeCamp.org

参考链接: Node.js 简介 (nodejs.cn)

#### NodeJS简介

1.Node.js 是一个开源与跨平台的 JavaScript 运行时环境。 它是一个可用于几乎任何项目的流行工具！

2.Node.js 具有独特的优势，因为为浏览器编写 JavaScript 的数百万前端开发者现在除了客户端代码之外还可以编写服务器端代码，而无需学习完全不同的语言。

3.我们尝试者建立一个简单的web服务器:

3.1 引入http模块

```
const http = require('http') //引入http模块

const hostname = '127.0.0.1'  //本地地址
const port = 3000   
```

3.2 运用http中的createServer（）函数创建新的服务器并返回

```
const server = http.createServer((req,res) => { //创建新的http服务器并返回
    res.statusCode = 200   //设置响应属性，200即表明响应成功
    res.setHeader('Content-Type','text/plain')  //设置响应的请求头信息
    res.end('Hello World!!!!!!!!!!!')//发送响应数据
})
```

每当接收到新的请求时， request 事件会被调用，并提供两个对象：一个请求（ http.IncomingMessage对象）和一个响应（ http.ServerResponse对象）。

http.IncomingMessage对象提供了请求的详细信息。 在这个简单的示例中没有使用它，但是你可以访问请求头和请求数据。

http.ServerResponse对象用于返回数据给调用方。

在这里没有用到。

3.3 设置终端响应

服务器被设置为监听指定的端口和主机名。 当服务器就绪后，回调函数会被调用，在此示例中会通知我们服务器服务器运行在http://127.0.0.1:3000

```
server.listen(port,hostname,()=>{
    console.log(`服务器运行在http://${hostname}:${port}/`)
})
```

之后直接进行编译即可在终端看到响应

除了编译之外运行 Node.js 程序的常规方法是，运行全局可用的`node`命令（已安装 Node.js）并传入要执行的文件的名称。确保该文件位于目录之下。

node xxx.js

3.4 查看响应信息

打开浏览器输入本地地址http://127.0.0.1:3000

4.从NodeJS的程序中退出（Process.exit()）

在不同的地方运行有不同的退出方式

在控制台运行时直接Ctrl+C即可关闭

以编程的方式退出要用到process核心模块的函数process.exit()

当NodeJS运行此代码时程序会被终止，无论运行到何种程度。

可以传入一个整数，向操作系统发送退出码：

```
process.exit(1)//传入一个整数
```

有关退出码的信息，详见 http://nodejs.cn/api/process.html#process_exit_codes

也可以设置`process.exitCode`属性：

```
process.exitCode = 1
```

当程序结束时，Node.js 会返回该退出码。

当进程完成所有处理后，程序会正常地退出。

5.从NodeJS中读取环境变量(process.env)

Node.js 的`process`核心模块提供了`env`属性，该属性承载了在启动进程时设置的所有环境变量。

这是访问 NODE_ENV 环境变量的示例，该环境变量默认情况下被设置为`development`。

```
process.env.NODE_ENV // "development"
```

在脚本运行之前将其设置为 "production"，则可告诉 Node.js 这是生产环境。

可以用相同的方式访问设置的任何自定义的环境变量。

6.如何使用NodeJS REPL(Read - Eval - Print - Loop)

REPL 也被称为运行评估打印循环，是一种编程语言环境（主要是控制台窗口），它使用单个表达式作为用户输入，并在执行后将结果返回到控制台。

`6.1`

`node`命令是用来运行 Node.js 脚本的命令：

```
node script.js
```

如果省略文件名，可以在 REPL 模式中使用它：

```
node
```

6.2 tap键自动补全

在编写代码时，如果按下`tab`键，则 REPL 会尝试自动补全所写的内容，以匹配已定义或预定义的变量。

6.3点命令

REPL 有一些特殊的命令，所有这些命令都以点号`.`开头。它们是：

- `.help`: 显示点命令的帮助。
- `.editor`: 启用编辑器模式，可以轻松地编写多行 JavaScript 代码。当处于此模式时，按下 ctrl-D 可以运行编写的代码。
- `.break`: 当输入多行的表达式时，输入`.break`命令可以中止进一步的输入。相当于按下 ctrl-C。
- `.clear`: 将 REPL 上下文重置为空对象，并清除当前正在输入的任何多行的表达式。
- `.load`: 加载 JavaScript 文件（相对于当前工作目录）。
- `.save`: 将在 REPL 会话中输入的所有内容保存到文件（需指定文件名）。
- `.exit`: 退出 REPL（相当于按下两次 ctrl-C）。

### Npm包管理工具:

参考链接: Managing Packages with Npm | freeCodeCamp

①Npm是Node包管理是开发者共享和管理模块或者包的命令行工具，它是由JavaScript编写的，广泛应用于Node.js

当开始一个新的项目时，npm 会生成一个`package.json`文件。这个文件列出了你项目的包依赖。由于 npm 的包更新很频繁，`package.json`文件允许你指定依赖的版本。这样就能保证包的升级不会破坏你的项目。

package.json文件是所有Node.js项目和Npm包的枢纽，它储存项目的相关信息。

②package.json中推荐键入的字段

1.描述和作者

1.1作者

author字段

```
"author": "Jane Doe",(人数多的时候用表)
```

1.2描述

description字段

描述字段是用来表明自己这个包的作用和用途或者是总结，描述字段是一种很好的方式去表达自己这个包的用途。

```
"description": "A project that does something awesome",
```

2.关键词

keywords字段

关键词字段可以帮助别人读懂你的项目或者包

```
"keywords": [ "descriptive", "related", "words" ],
```

和其他的不同，它是一个双引号字符串组成的数组

3.版本号

version字段

在package当中必填的，版本字段描述当前该项目的版本。

```
"version": "2.3.1",
```

4.许可证

license字段

许可证字段用来告知用户可以用你的项目或者包干什么。这是非必须的，但是添加上会更好。

```
"license": "MIT",
```

开源项目常见的协议有 MIT 和 BSD 等。

③使用npm添加外部拓展包

强大的依赖管理特性是使用包管理器的最大原因之一。

每当在新的计算机上开始一个项目时，无需手动，npm 会自动安装所有的依赖项。 但是 npm 如何准确地知道项目需要哪些依赖呢？ 来看看 package.json 文件中`dependencies`这一部分。

```
	"dependencies": {
		"package-name": "moment",
		"express": "2.14.0"
	},
```

这里即为添加了一个版本号为2.14.0的moment包

想要删除包的话，直接在键值对中删除对应的即可。

④使用语义化版本来管理npm依赖关系

语义化工作的示例：

```
"package": "MAJOR.MINOR.PATCH"
```

当做出了一些API不兼容的修改的时候，需要增加主版本号MAJOR，新增了功能进行兼容的时候添加测版本号MINOR，在修复之后就需要添加PATCH版本号。

⑤维持依赖项的最新的修订版

在之前的都是固定的修订版，当版本更新时，我们并不会更新，加入波浪线后，会自动更新中当前版本的0.0.x版本。

```
"package": "~1.3.8"
```

⑥维持依赖项的最新的次版本

用脱节符^，与波浪线符号不同的是，脱节符可以同时更新修订版和次版本。

```
"package": "^1.3.8"
```

将更新到1.x.x版本

### Express基础

#### express简介

“Express提供了创建 Web 服务器的最简单但功能最强大的方法之一。 它的极简主义方法，专注于服务器的核心功能，是其成功的关键。”

Express 框架核心特性：

可以设置中间件来响应 HTTP 请求。

定义了路由表用于执行不同的 HTTP 请求动作。

可以通过向模板传递参数来动态渲染 HTML 页面。

参考链接： Node.js Express 框架 | 菜鸟教程 (runoob.com)

①安装Express

```
$ npm install express
```

②搭建一个Express

1.引入Express以及设置端口

```
const express = require('express');

const port = 3000
```

2.生成一个express实例

```
const app = express();
```

3.处理请求 路径为localhost:3000/

```
app.get('/',(req,res)=>{
    res.send("Hello World!!!!!!!!")

})
```

4.监听开头设置的端口

```
app.listen(port,() => {
    console.log("服务启动成功");
});
```

之后运行即可，一个简单的Express框架。

今日学习至此

> 原载 [CSDN](https://blog.csdn.net/weixin_52400878/article/details/119961707)，同步至本站。
