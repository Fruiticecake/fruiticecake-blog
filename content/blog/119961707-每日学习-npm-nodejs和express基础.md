---
title: "每日学习（Npm,NodeJS和Express基础）"
date: 2021-08-28
summary: "此系列文章用来记录我的学习历程。 今日任务: 1.了解和学习Npm包管理工具 2.Node.js和Express基础 要想学习Npm之前我们应该先弄清楚，Npm是随同NodeJS一起安装的包管理工具，所以我们应该是先学习NodeJS的知识."
tags: ["CSDN同步", "node.js"]
slug: 119961707-每日学习-npm-nodejs和express基础
source: "https://blog.csdn.net/weixin_52400878/article/details/119961707"
html: true
---

<p>此系列文章用来记录我的学习历程。</p>

<p>今日任务:</p>

<p>1.了解和学习Npm包管理工具</p>

<p>2.Node.js和Express基础</p>

<p></p>

<p>要想学习Npm之前我们应该先弄清楚，Npm是随同NodeJS一起安装的包管理工具，所以我们应该是先学习NodeJS的知识.</p>

<p></p>

<p></p>

<h2><strong>NodeJS</strong></h2>

<p>参考链接<strong>:</strong><a href="https://chinese.freecodecamp.org/learn/apis-and-microservices/basic-node-and-express/meet-the-node-console">Basic Node and Express - 认识 Node 的控制台 | 学习 | freeCodeCamp.org</a></p>

<p>参考链接:<a href="http://nodejs.cn/learn">Node.js 简介 (nodejs.cn)</a></p>

<h3>NodeJS简介</h3>

<p>1.Node.js 是一个开源与跨平台的 JavaScript 运行时环境。 它是一个可用于几乎任何项目的流行工具！</p>

<p>2.Node.js 具有独特的优势，因为为浏览器编写 JavaScript 的数百万前端开发者现在除了客户端代码之外还可以编写服务器端代码，而无需学习完全不同的语言。</p>

<p></p>

<p>3.我们尝试者建立一个简单的web服务器:</p>

<p>3.1 引入http模块</p>

<pre>
<code>const http = require('http') //引入http模块

const hostname = '127.0.0.1'  //本地地址
const port = 3000   </code></pre>

<p>3.2 运用http中的createServer（）函数创建新的服务器并返回</p>

<pre>
<code>const server = http.createServer((req,res) =&gt; { //创建新的http服务器并返回
    res.statusCode = 200   //设置响应属性，200即表明响应成功
    res.setHeader('Content-Type','text/plain')  //设置响应的请求头信息
    res.end('Hello World!!!!!!!!!!!')//发送响应数据
})</code></pre>

<p>每当接收到新的请求时，<a href="http://nodejs.cn/api/http.html#http_event_request"><code>request</code> 事件</a>会被调用，并提供两个对象：一个请求（<a href="http://nodejs.cn/api/http.html#http_class_http_incomingmessage"><code>http.IncomingMessage</code></a> 对象）和一个响应（<a href="http://nodejs.cn/api/http.html#http_class_http_serverresponse"><code>http.ServerResponse</code></a> 对象）。</p>

<p><a href="http://nodejs.cn/api/http.html#http_class_http_incomingmessage"><code>http.IncomingMessage</code></a>对象提供了请求的详细信息。 在这个简单的示例中没有使用它，但是你可以访问请求头和请求数据。</p>

<p><a href="http://nodejs.cn/api/http.html#http_class_http_serverresponse"><code>http.ServerResponse</code></a>对象用于返回数据给调用方。</p>

<p>在这里没有用到。</p>

<p>3.3 设置终端响应</p>

<p>服务器被设置为监听指定的端口和主机名。 当服务器就绪后，回调函数会被调用，在此示例中会通知我们服务器服务器运行在<a>http://127.0.0.1:3000</a></p>

<pre>
<code>server.listen(port,hostname,()=&gt;{
    console.log(`服务器运行在http://${hostname}:${port}/`)
})</code></pre>

<p>之后直接进行编译即可在终端看到响应</p>

<p><img alt="" height="121" src="https://i-blog.csdnimg.cn/blog_migrate/f22e0cbb796bf0a3cc5f4ef4840a0e96.png" width="628" /></p>

<p>除了编译之外运行 Node.js 程序的常规方法是，运行全局可用的 <code>node</code> 命令（已安装 Node.js）并传入要执行的文件的名称。确保该文件位于目录之下。</p>

<p>node xxx.js</p>

<p> 3.4 查看响应信息</p>

<p>打开浏览器输入本地地址<a>http://127.0.0.1:3000 </a></p>

<p><img alt="" height="108" src="https://i-blog.csdnimg.cn/blog_migrate/654bffc1e0c70cf945958aafb9fa9c59.png" width="477" /></p>

<p></p>

<p> 4.从NodeJS的程序中退出（Process.exit()）</p>

<p></p>

<p>在不同的地方运行有不同的退出方式</p>

<p>在控制台运行时直接Ctrl+C即可关闭</p>

<p>以编程的方式退出要用到process核心模块的函数process.exit()</p>

<p>当NodeJS运行此代码时程序会被终止，无论运行到何种程度。</p>

<p>可以传入一个整数，向操作系统发送退出码：</p>

<pre>
<code>process.exit(1)//传入一个整数</code></pre>

<p>有关退出码的信息，详见 <a href="http://nodejs.cn/api/process.html#process_exit_codes">http://nodejs.cn/api/process.html#process_exit_codes</a></p>

<p>也可以设置 <code>process.exitCode</code> 属性：</p>

<pre>
<code>process.exitCode = 1</code></pre>

<p>当程序结束时，Node.js 会返回该退出码。</p>

<p>当进程完成所有处理后，程序会正常地退出。</p>

<p>5.从NodeJS中读取环境变量(process.env)</p>

<p></p>

<p>Node.js 的 <code>process</code> 核心模块提供了 <code>env</code> 属性，该属性承载了在启动进程时设置的所有环境变量。</p>

<p>这是访问 NODE_ENV 环境变量的示例，该环境变量默认情况下被设置为 <code>development</code>。</p>

<pre>
<code>process.env.NODE_ENV // "development"</code></pre>

<p>在脚本运行之前将其设置为 "production"，则可告诉 Node.js 这是生产环境。</p>

<p>可以用相同的方式访问设置的任何自定义的环境变量。</p>

<p></p>

<p>6.如何使用NodeJS REPL(Read - Eval - Print - Loop)</p>

<p>REPL 也被称为运行评估打印循环，是一种编程语言环境（主要是控制台窗口），它使用单个表达式作为用户输入，并在执行后将结果返回到控制台。</p>

<p></p>

<p><code>6.1</code></p>

<p><code>node</code> 命令是用来运行 Node.js 脚本的命令：</p>

<pre>
<code>node script.js</code></pre>

<p>如果省略文件名，可以在 REPL 模式中使用它：</p>

<pre>
<code>node</code></pre>

<p>6.2 tap键自动补全</p>

<p>在编写代码时，如果按下 <code>tab</code> 键，则 REPL 会尝试自动补全所写的内容，以匹配已定义或预定义的变量。</p>

<p>6.3点命令</p>

<p>REPL 有一些特殊的命令，所有这些命令都以点号 <code>.</code> 开头。它们是：</p>

<ul><li><code>.help</code>: 显示点命令的帮助。</li>
	<li><code>.editor</code>: 启用编辑器模式，可以轻松地编写多行 JavaScript 代码。当处于此模式时，按下 ctrl-D 可以运行编写的代码。</li>
	<li><code>.break</code>: 当输入多行的表达式时，输入 <code>.break</code> 命令可以中止进一步的输入。相当于按下 ctrl-C。</li>
	<li><code>.clear</code>: 将 REPL 上下文重置为空对象，并清除当前正在输入的任何多行的表达式。</li>
	<li><code>.load</code>: 加载 JavaScript 文件（相对于当前工作目录）。</li>
	<li><code>.save</code>: 将在 REPL 会话中输入的所有内容保存到文件（需指定文件名）。</li>
	<li><code>.exit</code>: 退出 REPL（相当于按下两次 ctrl-C）。</li>
</ul><p> </p>

<p></p>

<p></p>

<h2><strong>Npm包管理工具:</strong></h2>

<p>参考链接:<a href="https://learn.freecodecamp.one/apis-and-microservices/managing-packages-with-npm">Managing Packages with Npm | freeCodeCamp</a></p>

<p>①Npm是Node包管理是开发者共享和管理模块或者包的命令行工具，它是由JavaScript编写的，广泛应用于Node.js</p>

<p>当开始一个新的项目时，npm 会生成一个<code>package.json</code>文件。这个文件列出了你项目的包依赖。由于 npm 的包更新很频繁，<code>package.json</code>文件允许你指定依赖的版本。这样就能保证包的升级不会破坏你的项目。</p>

<p><img alt="" height="181" src="https://i-blog.csdnimg.cn/blog_migrate/2d36fe15b2191f5c4b0006949861a7a2.png" width="784" /></p>

<p> package.json文件是所有Node.js项目和Npm包的枢纽，它储存项目的相关信息。</p>

<p>②package.json中推荐键入的字段</p>

<p>1.描述和作者</p>

<p>1.1作者</p>

<p>author字段</p>

<pre>
<code>"author": "Jane Doe",(人数多的时候用表)</code></pre>

<p>1.2描述</p>

<p>description字段</p>

<p>描述字段是用来表明自己这个包的作用和用途或者是总结，描述字段是一种很好的方式去表达自己这个包的用途。</p>

<pre>
<code>"description": "A project that does something awesome",</code></pre>

<p>2.关键词</p>

<p>keywords字段</p>

<p>关键词字段可以帮助别人读懂你的项目或者包</p>

<pre>
<code>"keywords": [ "descriptive", "related", "words" ],</code></pre>

<p>和其他的不同，它是一个双引号字符串组成的数组</p>

<p>3.版本号</p>

<p>version字段</p>

<p>在package当中必填的，版本字段描述当前该项目的版本。</p>

<pre>
<code>"version": "2.3.1",</code></pre>

<p>4.许可证</p>

<p>license字段</p>

<p>许可证字段用来告知用户可以用你的项目或者包干什么。这是非必须的，但是添加上会更好。</p>

<pre>
<code>"license": "MIT",</code></pre>

<p> 开源项目常见的协议有 MIT 和 BSD 等。</p>

<p> ③使用npm添加外部拓展包</p>

<p>强大的依赖管理特性是使用包管理器的最大原因之一。</p>

<p>每当在新的计算机上开始一个项目时，无需手动，npm 会自动安装所有的依赖项。 但是 npm 如何准确地知道项目需要哪些依赖呢？ 来看看 package.json 文件中 <code>dependencies</code> 这一部分。</p>

<pre>
<code>	"dependencies": {
		"package-name": "moment",
		"express": "2.14.0"
	},</code></pre>

<p>这里即为添加了一个版本号为2.14.0的moment包</p>

<p>想要删除包的话，直接在键值对中删除对应的即可。</p>

<p>④使用语义化版本来管理npm依赖关系</p>

<p><img alt="" height="139" src="https://i-blog.csdnimg.cn/blog_migrate/a2f301e2c47ccfab4b1248b5c67308a1.png" width="951" /></p>

<p> 语义化工作的示例：</p>

<pre>
<code>"package": "MAJOR.MINOR.PATCH"</code></pre>

<p>当做出了一些API不兼容的修改的时候，需要增加主版本号MAJOR，新增了功能进行兼容的时候添加测版本号MINOR，在修复之后就需要添加PATCH版本号。</p>

<p>⑤维持依赖项的最新的修订版</p>

<p>在之前的都是固定的修订版，当版本更新时，我们并不会更新，加入波浪线后，会自动更新中当前版本的0.0.x版本。</p>

<pre>
<code>"package": "~1.3.8"</code></pre>

<p>⑥维持依赖项的最新的次版本</p>

<p>用脱节符^，与波浪线符号不同的是，脱节符可以同时更新修订版和次版本。</p>

<pre>
<code>"package": "^1.3.8"</code></pre>

<p>将更新到1.x.x版本</p>

<p></p>

<p></p>

<h2><strong>Express基础</strong></h2>

<h3>express简介</h3>

<p>“Express提供了创建 Web 服务器的最简单但功能最强大的方法之一。 它的极简主义方法，专注于服务器的核心功能，是其成功的关键。”</p>

<p>Express 框架核心特性：</p>

<ul><li>
	<p>可以设置中间件来响应 HTTP 请求。</p>
	</li>
	<li>
	<p>定义了路由表用于执行不同的 HTTP 请求动作。</p>
	</li>
	<li>
	<p>可以通过向模板传递参数来动态渲染 HTML 页面。</p>
	</li>
</ul><p>参考链接：<a href="https://www.runoob.com/nodejs/nodejs-express-framework.html">Node.js Express 框架 | 菜鸟教程 (runoob.com)</a></p>

<p></p>

<p>①安装Express</p>

<pre>
<code>$ npm install express</code></pre>

<p>②搭建一个Express</p>

<p>1.引入Express以及设置端口</p>

<pre>
<code>const express = require('express');

const port = 3000</code></pre>

<p>2.生成一个express实例</p>

<pre>
<code>const app = express();</code></pre>

<p>3.处理请求  路径为localhost:3000/</p>

<pre>
<code>app.get('/',(req,res)=&gt;{
    res.send("Hello World!!!!!!!!")

})</code></pre>

<p>4.监听开头设置的端口</p>

<pre>
<code>app.listen(port,() =&gt; {
    console.log("服务启动成功");
});</code></pre>

<p>之后运行即可，一个简单的Express框架。</p>

<p></p>

<p></p>

<p></p>

<p>今日学习至此</p>

<p></p>

<p><img alt="" height="322" src="https://i-blog.csdnimg.cn/blog_migrate/b946859e905b474ee40f40563731ab57.png" width="319" /></p>

<p> </p>

<p> </p>

<p></p>

<p></p>

<p></p>

<p></p>

<p></p>

<p></p>

<p></p>

<p></p>
<p class="source-note">原文发布于 <a href="https://blog.csdn.net/weixin_52400878/article/details/119961707" target="_blank" rel="noopener noreferrer">CSDN</a>。</p>
