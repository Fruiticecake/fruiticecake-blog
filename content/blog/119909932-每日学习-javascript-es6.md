---
title: 每日学习（JavaScript、ES6）
date: 2020-01-01
summary: 本文详细记录了作者学习过程中的javascript基础知识，包括变量、字符串、数组、运算符、对象，以及es6新特性如let和const、箭头函数、rest操作符、解构赋值、模板字符串、类与模块等，共1…
tags: [CSDN同步, javascript]
slug: 119909932-每日学习-javascript-es6
source: https://blog.csdn.net/weixin_52400878/article/details/119909932
---

本文详细记录了作者学习过程中的javascript基础知识，包括变量、字符串、数组、运算符、对象，以及es6新特性如let和const、箭头函数、rest操作符、解构赋值、模板字符串、类与模块等，共142道题目实战演练。

此系列文章来记录我的学习历程。

今日任务：Javascript基础和ES6 共计142道题

Javascript基础：

①注释：行内注释"//" 行外注释/*content*/

②变量声明: var 变量 在 JavaScript 中以分号结束语句。 变量名称可以由数字、字母、美元符号`$`或者下划线`_`组成，但是不能包含空格或者以数字为开头。

③转义字符：/ 必须对反斜杠本身进行转义，它才能显示为反斜杠。

④用变量构造字符串 ：

```
var ourStr = "Hello, our name is " + ourName + ", how are you?";
```

outStr显示为 Hello, our name is freeCodeCamp, how are you?

也可以使用 “+=”进行构造字符串。

```
var anAdjective = "awesome!";
var ourStr = "freeCodeCamp is ";
ourStr += anAdjective;
```

⑤字符串的长度：string.lenght;可配合方括号查找第N个字符

```
var firstName = "Augusta";
var thirdToLastLetter = firstName[firstName.length - 3];
```

这里查找的是倒数第3个。

⑥数组：

1.嵌套数组（多维数组）

```
[["Bulls", 23], ["White Sox", 45]]
```

2.利用索引编号查找和修改数组中的元素，数组从0开始计数

```
var array = [50,60,70];
array[0];
var data = array[1];
```

3.各种函数对数组的操作

.push（）函数将数据添加到数组末尾

```
var myArray = [["John", 23], ["cat", 2]];
myArray.push(["dog",3])

//myArray = [["John", 23], ["cat", 2],["dog",3]]
```

.pop()函数移除数组末尾的元素并返回这个元素。

```
var threeArr = [1, 4, 6];
var oneDown = threeArr.pop();
console.log(oneDown);//6
console.log(threeArr);//1,4
```

.shift()函数移除第一个元素

```
var ourArray = ["Stimpson", "J", ["cat"]];
var removedFromOurArray = ourArray.shift();

ourArray 值为 ["J", ["cat"]]
```

.unshift()函数移入第一个元素

```
var ourArray = ["Stimpson", "J", "cat"];
ourArray.shift();
ourArray.unshift("Happy");

ourArray 值为 ["Happy", "J", "cat"]。
```

⑦运算符：

严格类的比普通类多一个等号 示例

等于：==，严格等于：===，严格与普通相比更精确，要求值的类型要相同，普通判断会转换。

⑧对象：

JavaScript 对象是一种灵活的数据结构。 它可以储存字符串（strings）、数字（numbers）、布尔值（booleans）、数组（arrays）、函数（functions）和对象（objects）以及这些值的任意组合。

这是一个复杂数据结构的示例：

```
var ourMusic = [
  {
    "artist": "Daft Punk",
    "title": "Homework",
    "release_year": 1997,
    "formats": [ 
      "CD", 
      "Cassette", 
      "LP"
    ],
    "gold": true
  }
];
```

这是一个包含一个对象的数组。 该对象有关于专辑的各种元数据（metadata）。 它也有一个嵌套的`formats`数组。 可以将专辑添加到顶级数组来增加更多的专辑记录。 对象将数据以一种键 - 值对的形式保存。 在上面的示例中，`"artist": "Daft Punk"`有一个键位`artist`值为`Daft Punk`的属性。 JavaScript Object Notation简称`JSON`是可以用于存储数据的数据交换格式。

（数组中有多个 JSON 对象的时候，对象与对象之间要用逗号隔开。）

ES6：

①var和let关键字的差异：

```
var camper = 'James';
var camper = 'David';

camper值为 'David'

let camper = 'James';
let camper = 'David';

camper值为 'James'
```

1.var关键字可以被重复声明，会导致变量被覆盖，let关键字只会被声明一次，可以避免被重复声明。

var和let关键字的作用域不同

2.使用`var`关键字来声明一个变量的时候，这个变量会被声明成全局变量，或是函数内的局部变量。

`let`关键字的作用与此类似，但会有一些额外的特性。 如果在代码块、语句或表达式中使用关键字`let`声明变量，这个变量的作用域就被限制在当前的代码块、语句或表达式之中。

示例：

```
var numArray = [];
for (var i = 0; i < 3; i++) {
  numArray.push(i);
}
console.log(numArray);   //[0, 1, 2] 
console.log(i);     //3
```

如果你创建一个函数，将它存储起来，稍后在使用`i`变量的`for`循环中使用。这么做可能会出现问题。 这是因为存储的函数会总是指向更新后的全局`i`变量的值。

```
var printNumTwo;
for (var i = 0; i < 3; i++) {
  if (i === 2) {
    printNumTwo = function() {
      return i;
    };
  }
}
console.log(printNumTwo());  //3
```

可以看到，`printNumTwo()`打印了 3，而不是 2。 这是因为赋值给`i`的值已经更新，`printNumTwo()`返回全局的`i`，而不是在 for 循环中创建函数时`i`的值。`let`关键字就不会出现这种现象.

②const关键字

const关键字与let的差别就在，const不可以被改变，const声明的变量是固定值不可以再再次声明改变。

③箭头函数编写匿名函数

在JavaScript中会遇到许多不需要命名的函数，一般会采用以下方式：

```
const myFunc = function() {
  const myVar = "value";
  return myVar;
}
```

ES6 提供了其他写匿名函数的方式的语法糖。 你可以使用箭头函数：

```
const myFunc = () => {
  const myVar = "value";
  return myVar;
}
```

当不需要函数体，只返回一个值的时候，箭头函数允许你省略`return`关键字和外面的大括号。 这样就可以将一个简单的函数简化成一个单行语句。

```
const myFunc = () => "value";
```

与原本的基本相同，括号中同样可以带参数。

④rest操作符

ES6 推出了用于函数参数的 rest 操作符帮助我们创建更加灵活的函数。 rest 操作符可以用于创建有一个变量来接受多个参数的函数。 这些参数被储存在一个可以在函数内部读取的数组中。

```
const sum = (x, y, z) => {
  const args = [x, y, z];
  return args.reduce((a, b) => a + b, 0);
}

改写成
const sum = (...args) => {
  return args.reduce((a, b) => a + b, 0);
}
```

⑤解构赋值

解构赋值是 ES6 引入的新语法，用来从数组和对象中提取值，并优雅地对变量进行赋值。

```
ES5：

const user = { name: 'John Doe', age: 34 };

const name = user.name;
const age = user.age;

ES6：
const { name, age } = user;
```

自动创建`name`和`age`变量，并将`user`对象相应属性的值赋值给它们。 这个方法简洁多了。

⑥模板字符串

模板字符串是 ES6 的另外一项新的功能。 这是一种可以轻松构建复杂字符串的方法。

模板字符串可以使用多行字符串和字符串插值功能。

```
const person = {
  name: "Zodiac Hasbro",
  age: 56
};

const greeting = `Hello, my name is ${person.name}!
I am ${person.age} years old.`;

console.log(greeting);//Hello, my name is Zodiac Hasbro! 和 I am 56 years old.
```

⑦class语法定义构造函数

```
class Vegetable{
  constructor(name){
    this.name=name;
  }
}

const carrot = new Vegetable('carrot');
console.log(carrot.name); // 应该显示 'carrot'
```

⑧模块

1.export来重用模块

假设有一个文件`math_functions.js`，该文件包含了数学运算相关的一些函数。 其中一个存储在变量`add`里，该函数接受两个数字作为参数返回它们的和。 你想在几个不同的 JavaScript 文件中使用这个函数。 要实现这个目的，就需要`export`它。

```
const add = (x, y) => {
  return x + y;
}

export { add };
```

2.import复用代码

`import`可以导入文件或模块的一部分。

```
import { add, subtract } from './math_functions.js';
```

假设你有一个文件，你希望将其所有内容导入到当前文件中。 可以用`import * as`语法来实现。

```
import * as myMathModule from "./math_functions.js";
```

3.export default 创建一个默认导出

在文件中只有一个值需要导出的时候，通常会使用这种语法。 它也常常用于给文件或者模块创建返回值。

```
export default function add(x, y) {
  return x + y;
}

export default function(x, y) {
  return x + y;
}
```

第一个是命名函数，第二个是匿名函数。

导入默认导出

```
import add from "./math_functions.js";
```

⑨JavaScript promise

Promise 是异步编程的一种解决方案 - 它在未来的某时会生成一个值。 任务完成，分执行成功和执行失败两种情况。`Promise`是构造器函数，需要通过`new`关键字来创建。 构造器参数是一个函数，该函数有两个参数 -`resolve`和`reject`。 通过它们来判断 promise 的执行结果。 用法如下：

```
const myPromise = new Promise((resolve, reject) => {

});
```

Promise 有三个状态：`pending`、`fulfilled`和`rejected`。

Promise 提供的`resolve`和`reject`参数就是用来结束 promise 的。 Promise 成功时调用`resolve`，promise 执行失败时调用`reject`， 如下文所述，这些方法需要有一个参数。

```
const makeServerRequest = new Promise((resolve, reject) => {
  // responseFromServer 表示从服务器获得一个响应
  let responseFromServer;

  if(responseFromServer) {
    resolve("We got the data");
    // 修改这一行
  } else {
     reject("Data not received");  
    // 修改这一行
  }
});
```

当程序需要花费未知的时间才能完成时（比如一些异步操作），一般是服务器请求，promise 很有用。 服务器请求会花费一些时间，当结束时，需要根据服务器的响应执行一些操作。 这可以用`then`方法来实现， 当 promise 完成`resolve`时会触发`then`方法。 例子如下：

```
myPromise.then(result => {

});
```

`result`即传入`resolve`方法的参数。

同样的当失败时 使用catch方法

```
myPromise.catch(error => {

});

const makeServerRequest = new Promise((resolve, reject) => {
  // responseFromServer 设置为 false，表示从服务器获得无效响应
  let responseFromServer = false;

  if(responseFromServer) {
    resolve("We got the data");
  } else {  
    reject("Data not received");
  }
});

makeServerRequest.then(result => {
  console.log(result);
});

makeServerRequest.catch(error => {
  console.log(error);
});
```

今日学习至此

> 原载 [CSDN](https://blog.csdn.net/weixin_52400878/article/details/119909932)，同步至本站。
