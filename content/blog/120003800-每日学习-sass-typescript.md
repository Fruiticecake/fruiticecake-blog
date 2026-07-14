---
title: "每日学习（Sass，TypeScript）"
date: 2021-08-30
summary: "此系列文章用来记录我的学习历程。 今日任务： 1.Sass 2TypeScript Sass： 参考链接：Sass 教程 | 菜鸟教程 (runoob.com) 简介： Sass 是一个 CSS 预处理器。 Sass 是 CSS 扩展语言，"
tags: ["CSDN同步", "typescript", "javascript", "css", "sass"]
slug: 120003800-每日学习-sass-typescript
source: "https://blog.csdn.net/weixin_52400878/article/details/120003800"
html: true
---

<p></p>

<p></p>

<p>此系列文章用来记录我的学习历程。</p>

<p>今日任务：</p>

<p>1.Sass</p>

<p>2TypeScript</p>

<p></p>

<p></p>

<p></p>

<h1>Sass：</h1>

<p>参考链接：<a href="https://www.runoob.com/sass/sass-tutorial.html">Sass 教程 | 菜鸟教程 (runoob.com)</a></p>

<p>简介：</p>

<p>Sass 是一个 CSS 预处理器。</p>

<p>Sass 是 CSS 扩展语言，可以帮助我们减少 CSS 重复的代码，节省开发时间。</p>

<p>Sass 完全兼容所有版本的 CSS。</p>

<p>Sass 扩展了 CSS3，增加了规则、变量、混入、选择器、继承、内置函数等等特性。</p>

<p>Sass 生成良好格式化的 CSS 代码，易于组织和维护。</p>

<p></p>

<p>①用Sass变量存储数据</p>

<p>Sass 不同于 CSS 的一个特点是它允许使用变量。 可以在 Sass 中声明变量，并为它赋值，就像在 JavaScript 中一样。</p>

<p>在 JavaScript 中，变量是使用 <code>let</code> 和 <code>const</code> 关键字定义的。 在 Sass 中，变量以 <code>$</code> 开头的，后跟变量名。</p>

<p>示例：</p>

<pre>
<code>$main-fonts: Arial, sans-serif;
$headings-color: green;
h1 {
  font-family: $main-fonts;
  color: $headings-color;
}</code></pre>

<p>②Sass嵌套css</p>

<p>在 CSS 里，每个元素的样式都需要写在独立的代码块中。</p>

<p>示例：</p>

<pre>
<code>nav {
  background-color: red;
}

nav ul {
  list-style: none;
}

nav ul li {
  display: inline-block;
}</code></pre>

<p>对于一个大型项目，CSS 规则会很复杂。 这时，引入嵌套功能（即在对应的父元素中写子元素的样式）可以有效地简化代码：</p>

<pre>
<code>nav {
  background-color: red;

  ul {
    list-style: none;

    li {
      display: inline-block;
    }
  }
}
</code></pre>

<p>③用Mixins创建可以用css</p>

<p>在 Sass 中，mixin 是一组 CSS 声明，可以在整个样式表中重复使用。</p>

<p>CSS 的新功能需要一段时间适配后，所有浏览器后才能完全使用。 随着浏览器的不断升级，使用这些 CSS 规则时可能需要添加浏览器前缀。</p>

<p>定义以 <code>@mixin</code> 开头，后跟自定义名称。 参数（<code>$自定义</code> ）。 现在在需要 border-radius 规则的地方，只需一行 mixin 调用而无需添加所有的浏览器前缀。 mixin 可以通过 <code>@include</code> 指令调用。</p>

<pre>
<code>&lt;style type='text/scss'&gt;
@mixin border-radius($radius){
  -webkit-border-radius:$radius;
  -moz-border-radius:$radius;
  -ms-border-radius:$radius;
  border-radius:$radius;
}
  #awesome {
    width: 150px;
    height: 150px;
    background-color: green;
    @include border-radius(15px);
  }
&lt;/style&gt;

&lt;div id="awesome"&gt;&lt;/div&gt;</code></pre>

<p>④使用@if和@else为样式添加逻辑</p>

<p>Sass 中的 <code>@if</code> 指令对于测试特定情况非常有用——它的工作方式与 JavaScript 中的 <code>if</code> 语句类似。</p>

<pre>
<code>&lt;style type='text/scss'&gt;

@mixin border-stroke($val){
  @if $val == light{
    border:1px solid black;
  }
  @else if $val == medium{
    border:3px solid black;
  }
  @else if $val == heavy{
    border:6px solid black;
  }
  @else {
    border:none;
  }
}

  #box {
    width: 150px;
    height: 150px;
    background-color: red;
    @include border-stroke(medium);
  }
&lt;/style&gt;

&lt;div id="box"&gt;&lt;/div&gt;</code></pre>

<p>⑤使用@for创建一个Sass循环</p>

<p>可以在 Sass 中使用 <code>@for</code> 循环添加样式，它的用法和 JavaScript 中的 <code>for</code> 循环类似。</p>

<p><code>@for</code> 以两种方式使用：“开始 through 结束” 或 “开始 to 结束”。 主要区别在于“开始 <strong>to</strong> 结束”<em>不包括</em>结束数字，而“开始 <strong>through</strong> 结束”<em>包括</em> 结束号码。</p>

<pre>
<code>&lt;style type='text/scss'&gt;

@for $j from 1 to 6 {
  .text-#{$j} {font-size:15px * $j};
}
&lt;!--#{$j} 部分是将变量（j）与文本组合成字符串的语法。--&gt; 

&lt;/style&gt;

&lt;p class="text-1"&gt;Hello&lt;/p&gt;
&lt;p class="text-2"&gt;Hello&lt;/p&gt;
&lt;p class="text-3"&gt;Hello&lt;/p&gt;
&lt;p class="text-4"&gt;Hello&lt;/p&gt;
&lt;p class="text-5"&gt;Hello&lt;/p&gt;</code></pre>

<p>⑥使用@each遍历列表中的项目</p>

<p>Sass 还提供 <code>@each</code> 指令，该指令循环遍历列表或映射中的每个项目。 在每次迭代时，变量将从列表或映射分配给当前值。</p>

<pre>
<code>@each $color in blue, red, green {
  .#{$color}-text {color: $color;}
}</code></pre>

<p>map 的语法略有不同。 这是一个例子：</p>

<pre>
<code>$colors: (color1: blue, color2: red, color3: green);

@each $key, $color in $colors {
  .#{$color}-text {color: $color;}
}</code></pre>

<p>请注意，需要用 <code>$key</code> 变量来引用 map 中的键。 否则，编译后的 CSS 将包含 <code>color1</code>，<code>color2</code>...... 以上两个代码示例都转换为以下 CSS：</p>

<pre>
<code>.blue-text {
  color: blue;
}

.red-text {
  color: red;
}

.green-text {
  color: green;
}</code></pre>

<p>⑦使用@while循环创建样式</p>

<p>Sass 中的 <code>@while</code> 指令与 JavaScript 中的 <code>while</code> 类似。 只要满足条件，它就会一直创建 CSS 代码。</p>

<pre>
<code>&lt;style type='text/scss'&gt;
$x:1;
@while $x &lt; 6 {
  .text-#{$x} {font-size:15px*$x;}
  $x:$x+1;
}


&lt;/style&gt;

&lt;p class="text-1"&gt;Hello&lt;/p&gt;
&lt;p class="text-2"&gt;Hello&lt;/p&gt;
&lt;p class="text-3"&gt;Hello&lt;/p&gt;
&lt;p class="text-4"&gt;Hello&lt;/p&gt;
&lt;p class="text-5"&gt;Hello&lt;/p&gt;</code></pre>

<p>⑧用partials将样式分成小块</p>

<p>Sass 中的 Partials 是包含 CSS 代码段的单独的文件。 这些片段可以导入其它 Sass 文件使用。 可以把类似代码放到模块中，以保持代码结构规整且易于管理。</p>

<p>请注意，<code>import</code> 语句中不需要下划线——Sass 知道它是 partial。 将 partial 导入文件后，可以使用所有变量、mixins 和其它代码。</p>

<pre>
<code>&lt;!-- main.scss 文件 --&gt;
&lt;!-- 将名为 _variables.scss 的 partial 导入 main.scss 文件。 --&gt;
@import 'variables'</code></pre>

<p>⑨将一组css样式扩展到另一个元素</p>

<p>Sass 有一个名为 <code>extend</code> 的功能，可以很容易地从一个元素中借用 CSS 规则并在另一个元素上重用它们。</p>

<p>示例：</p>

<p>.info-important包含了info中的所有元素。</p>

<pre>
<code>  .info{
    width: 200px;
    border: 1px solid black;
    margin: 0 auto;
  }

  .info-important{
    @extend .info;
    background-color:magenta;
  }</code></pre>

<p></p>

<h1></h1>

<h1>TypeScript</h1>

<p>参考链接：<a href="https://www.runoob.com/typescript/ts-tutorial.html">TypeScript 教程 | 菜鸟教程 (runoob.com)</a></p>

<p>参考链接：<a href="https://www.tslang.cn/docs/handbook/typescript-in-5-minutes.html">5分钟上手TypeScript · TypeScript中文网 · TypeScript——JavaScript的超集 (tslang.cn)</a></p>

<h3>简介</h3>

<p>TypeScript 是 JavaScript 的一个超集，支持 ECMAScript 6 标准（<a href="https://www.runoob.com/w3cnote/es6-tutorial.html">ES6 教程</a>）。</p>

<p>TypeScript 由微软开发的自由和开源的编程语言。</p>

<p>TypeScript 设计目标是开发大型应用，它可以编译成纯 JavaScript，编译出来的 JavaScript 可以运行在任何浏览器上。TypeScript 是一种给 JavaScript 添加特性的语言扩展。</p>

<h3>JavaScript 与 TypeScript 的区别</h3>

<p>TypeScript 是 JavaScript 的超集，扩展了 JavaScript 的语法，因此现有的 JavaScript 代码可与 TypeScript 一起工作无需任何修改，TypeScript 通过类型注解提供编译时的静态类型检查。</p>

<p>TypeScript 可处理已有的 JavaScript 代码，并只对其中的 TypeScript 代码进行编译。</p>

<p></p>

<p></p>

<p></p>

<p>①TS基础语法</p>

<p>第一个TS小程序：</p>

<p>1. 建立一个first.ts文件，代码为：</p>

<pre>
<code class="language-TypeScript">const hello : string = "Hello World!"
console.log(hello)</code></pre>

<p>以上代码首先通过 <strong>tsc</strong> 命令编译：</p>

<pre>
<code>tsc Runoob.ts</code></pre>

<p>最后我们使用 node 命令来执行该 js 代码。</p>

<pre>
<code>$ node Runoob.js
Hello World</code></pre>

<p>我们可以同时编译多个 ts 文件：</p>

<pre>
<code>tsc file1.ts file2.ts file3.ts</code></pre>

<h3>2.空白和换行</h3>

<p>TypeScript 会忽略程序中出现的空格、制表符和换行符。</p>

<p>空格、制表符通常用来缩进代码，使代码易于阅读和理解。</p>

<h3>3.TypeScript 区分大小写</h3>

<p>TypeScript 区分大写和小写字符。</p>

<h3>分号是可选的</h3>

<p>每行指令都是一段语句，你可以使用分号或不使用， 分号在 TypeScript 中是可选的，建议使用。</p>

<p>以下代码都是合法的：</p>

<pre>
console.log("Runoob")
console.log("Google");</pre>

<p>如果语句写在同一行则一定需要使用分号来分隔，否则会报错，如：</p>

<pre>
console.log("Runoob");console.log("Google");</pre>

<h3>TypeScript 支持两种类型的注释</h3>

<ul><li>
	<p><strong>单行注释 ( // )</strong> − 在 // 后面的文字都是注释内容。</p>
	</li>
	<li>
	<p><strong>多行注释 (/* */)</strong> − 这种注释可以跨越多行。</p>
	</li>
</ul><h3>TypeScript 与面向对象</h3>

<ul><li><strong>对象</strong>：对象是类的一个实例（<strong>对象不是找个女朋友</strong>），有状态和行为。例如，一条狗是一个对象，它的状态有：颜色、名字、品种；行为有：摇尾巴、叫、吃等。</li>
	<li><strong>类</strong>：类是一个模板，它描述一类对象的行为和状态。</li>
	<li><strong>方法</strong>：方法是类的操作的实现步骤。</li>
</ul><p>TypeScript 面向对象编程实例：</p>

<pre>
<code class="language-TypeScript">class Site { 
   name():void { 
      console.log("Runoob") 
   } 
} 
var obj = new Site(); 
obj.name();</code></pre>

<p> </p>

<p>以上实例定义了一个类 Site，该类有一个方法 name()，该方法在终端上输出字符串 Runoob。</p>

<p>new 关键字创建类的对象，该对象调用方法 name()。</p>

<p>编译后生成的 JavaScript 代码如下：</p>

<pre>
<code class="language-javascript">var Site = /** @class */ (function () {
    function Site() {
    }
    Site.prototype.name = function () {
        console.log("Runoob");
    };
    return Site;
}());
var obj = new Site();
obj.name();//输出为Runoob


</code></pre>

<p></p>

<h1>TypeScript的好处</h1>

<h3>类型注解</h3>

<p>TypeScript里的类型注解是一种轻量级的为函数或变量添加约束的方式。 在这个例子里，我们希望 <code>greeter</code>函数接收一个字符串参数。 然后尝试把 <code>greeter</code>的调用改成传入一个数组：<code> </code></p>

<pre>
<code>function greeter(person: string) {
    return "Hello, " + person;
}

let user = [0, 1, 2];

document.body.innerHTML = greeter(user);</code></pre>

<p></p>

<p>重新编译，你会看到产生了一个错误。</p>

<pre>
<code>greeter.ts(7,26): error TS2345: Argument of type 'number[]' is not assignable to parameter of type 'string'.</code></pre>

<p></p>

<p>类似地，尝试删除<code>greeter</code>调用的所有参数。 TypeScript会告诉你使用了非期望个数的参数调用了这个函数。 在这两种情况中，TypeScript提供了静态的代码分析，它可以分析代码结构和提供的类型注解。</p>

<p>要注意的是尽管有错误，<code>greeter.js</code>文件还是被创建了。 就算你的代码里有错误，你仍然可以使用TypeScript。但在这种情况下，TypeScript会警告你代码可能不会按预期执行。</p>

<p></p>

<p>今日学习至此</p>

<p></p>

<p></p>

<p><img alt="" height="349" src="https://i-blog.csdnimg.cn/blog_migrate/b946859e905b474ee40f40563731ab57.png" width="346" /></p>

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
<p class="source-note">原文发布于 <a href="https://blog.csdn.net/weixin_52400878/article/details/120003800" target="_blank" rel="noopener noreferrer">CSDN</a>。</p>
