---
title: 每日学习（React，Redux）
date: 2020-01-01
summary: 本文详细介绍了React的基础概念，如何与JSX配合，以及Redux的状态管理，包括创建store、actions、reducers和组件间交互。深入探讨了React组件生命周期、内联样式、Redux…
tags: [CSDN同步]
slug: 119967433-每日学习-react-redux
source: https://blog.csdn.net/weixin_52400878/article/details/119967433
---

本文详细介绍了React的基础概念，如何与JSX配合，以及Redux的状态管理，包括创建store、actions、reducers和组件间交互。深入探讨了React组件生命周期、内联样式、Redux的使用和React与Redux的配合技巧。

此系列文章用来记录我的学习历程。

今日任务：

fcc:

1.React

2.React和Redux配合

3.Redux

## React

简介

React 是由 Facebook 创建和维护的开源视图库。 它是渲染现代 Web 应用程序用户界面（UI）的好工具。

React 使用名为 JSX 的 JavaScript 语法扩展，可以直接在 JavaScript 中编写 HTML。

因为 JSX 是 JavaScript 的语法扩展，所以实际上可以直接在 JSX 中编写 JavaScript。要做到这一点，只需在花括号中包含希望被视为 JavaScript 的代码：

```
{ 'this is treated as JavaScript code' }
```

### Ract基础:

①简单的编写

要点:

关于嵌套的 JSX，需要知道的一件重要的事情，那就是它必须返回单个元素。

这个父元素将包裹所有其他级别的嵌套元素。

示例:

```
//有效示例

<div>
  <p>a</p>
  <p>b</p>
  <p>c</p>
</div>

//无效示例

<p>a</p>
<p>b</p>
<p>c</p>

```

②在JSX中注释

使用{/* */}语法注释

```
const JSX = (
  <div>
    {/*    
    <h1>This is a block of JSX</h1>
    <p>Here's a subtitle</p>
    */}
  </div>
);
```

③渲染HTML元素为DOM树

方法：ReactDOM.render(componentToRender, targetNode)

其中第一个参数是要渲染的 React 元素或组件，第二个参数是组件将要渲染到的 DOM 节点。

代码编辑器中有一个简单的 JSX 组件。使用`document.getElementById()`来选择要渲染到的 DOM 节点。

示例：渲染ID为'challenge-node'

```
ReactDOM.render(JSX,document.getElementById('challenge-node'))
```

④用className作为类关键字

JSX和JavaScript不同，不能用class命名类，要使用className

```
const JSX = (
  <div className="myDiv">
    <h1 >Add a class to this div</h1>
  </div>
);
```

⑤创建一个React组件

定义 React 组件的另一种方法是使用 ES6 的`class`语法。 在以下示例中，`Kitten`扩展了`React.Component`：

```
class Kitten extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return (
      <h1>Hi</h1>
    );
  }
}
```

⑥使用React渲染嵌套组件

在render之后加入标签即可<组件名称 />

```
class Kitten extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return (
      <h1>Hi</h1>
      <zujian />
    );
  }
}
```

⑦将class组件渲染到DOM树

语法：`ReactDOM.render(componentToRender, targetNode)`。 第一个参数是要渲染的 React 组件。 第二个参数是要在其中渲染该组件的 DOM 节点。

传递到`ReactDOM.render()`的React 组件与 JSX 元素略有不同。 对于 JSX 元素，传入的是要渲染的元素的名称。 但是，对于 React 组件，需要使用与渲染嵌套组件相同的语法，例如`ReactDOM.render(, targetNode)`。 此语法用于 ES6 class 组件和函数组件都可以。

在后台引入了`Fruits`和`Vegetables`组件。 将两个组件渲染为`TypesOfFood`组件的子组件，然后将`TypesOfFood`渲染到 DOM 节点， 在这个挑战中，请渲染到`id='challenge-node'`的`div`中。

```
class TypesOfFood extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      <div>
        <h1>Types of Food:</h1>
        {/* 修改这行下面的代码 */}
            < Fruits />
            < Vegetables />
        {/* 修改这行上面的代码 */}
      </div>
    );
  }
};

// 修改这行下面的代码
ReactDOM.render(<TypesOfFood/>,document.getElementById("challenge-node"));
```

⑧props

1.访问props

无状态函数组件：

假设有一个`App`组件，该组件渲染了一个名为`Welcome`的子组件，它是一个无状态函数组件。 可以通过以下方式给`Welcome`传递一个`user`属性：

```
<App>
  <Welcome user='Mark' />
</App>
```

由于`Welcome`是一个无状态函数组件，它可以像这样访问该值：

```
const Welcome = (props) => <h1>Hello, {props.user}!</h1>
```

ES6 类组件：

任何时候，如果要引用类组件本身，可以使用`this`关键字。 要访问类组件中的 props，需要在在访问它的代码前面添加`this`。 例如，如果 ES6 类组件有一个名为`data`的 prop，可以在 JSX 中这样写：

```
{this.props.data}
```

2.PropTypes定义props类型

React 提供了有用的类型检查特性，以验证组件是否接收了正确类型的 props。 例如，应用程序调用 API 来检索数据是否是数组，然后将数据作为 prop 传递给组件。 可以在组件上设置`propTypes`，以要求数据的类型为`array`。 当数据是任何其它类型时，都会抛出警告。

当提前知道 prop 的类型时，最佳实践是设置其`propTypes`。 可以为组件定义`propTypes`属性，方法与定义`defaultProps`相同。 这样做将检查给定键的 prop 是否是给定类型。 这里有一个示例，表示名为`handleClick`的 prop 应为`function`类型：

```
MyComponent.propTypes = { handleClick: PropTypes.func.isRequired }
```

小练习：

1.创建一个可以控制的输入框

通常，如果 React 组件具有用户可以键入的输入字段，那么它将是一个受控的输入表单。

代码编辑器具有一个名为`ControlledInput`的组件框架，用于创建受控的`input`元素。 组件的`state`已经被包含空字符串的`input`属性初始化。 此值表示用户在`input`字段中键入的文本。

```
class ControlledInput extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      input: ''
    };
    // 修改这行下面的代码
this.handleChange=this.handleChange.bind(this)
    // 修改这行上面的代码
  }
  // 修改这行下面的代码
handleChange(event){
  this.setState({
    input: event.target.value
  })
}
  // 修改这行上面的代码
  render() {
    return (
      <div>
        { /* 修改这行下面的代码 */}
        <input value={this.state.input} onChange = {this.handleChange.bind(this)}/>
        { /* 修改这行上面的代码 */}
        <h4>Controlled Input:</h4>
        <p>{this.state.input}</p>
      </div>
    );
  }
};
```

在输入框中键入时，文本由`handleChange()`方法处理，文本被设置为本地`state`中的`input`属性，并渲染在页面上的`input`框中。 组件`state`是输入数据的唯一真实来源。

2.创建一个可以控制的表单

```
class MyForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      input: '',
      submit: ''
    };
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }
  handleChange(event) {
    this.setState({
      input: event.target.value
    });
  }
  handleSubmit(event) {
    // 修改这行下面的代码
    event.preventDefault()
    this.setState({
      submit:this.state.input
    })
    // 修改这行上面的代码
  }
  render() {
    return (
      <div>
        <form onSubmit={this.handleSubmit}>
          {/* 修改这行下面的代码 */}
          <input value={this.state.input} onChange={this.handleChange}/>
          {/* 修改这行上面的代码 */}
          <button type='submit'>Submit!</button>
        </form>
        {/* 修改这行下面的代码 */}
        <h1>{this.state.submit}</h1>
        {/* 修改这行上面的代码 */}
      </div>
    );
  }
}
```

注意： 还必须在提交处理程序中调用`event.preventDefault()`，以防止将会刷新网页的默认的表单提交行为。

⑨React组件中的特殊方法：

生命周期方法

```
componentWillMount() 
componentDidMount() 
shouldComponentUpdate() 
componentDidUpdate() 
componentWillUnmount()
………………
```

1.componentWillMount()函数

当组件被挂载到 DOM 时，`componentWillMount()`方法在`render()`方法之前被调用。 在`componentWillMount()`中将一些内容记录到控制台 -- 可能需要打开浏览器控制台以查看输出。

2.componentDidMount()函数

某些时候，大多数 web 开发人员需要调用 API 接口来获取数据。 如果正在使用 React，知道在哪里执行这个动作是很重要的。

React 的最佳实践是在生命周期方法`componentDidMount()`中对服务器进行 API 调用或任何其它调用。 将组件装载到 DOM 后会调用此方法。 此处对`setState()`的任何调用都将触发组件的重新渲染。 在此方法中调用 API 并用 API​​ 返回的数据设置 state 时，一旦收到数据，它将自动触发更新。

```
  componentDidMount() {
    setTimeout(() => {
      this.setState({
        activeUsers: 1273
      });
    }, 2500);
  }
```

3.在React中添加内联样式

```
const styles = {
  color: 'purple',
  fontSize: 40,
  border: "2px solid purple",
};

// 修改这行上面的代码
class Colorful extends React.Component {
  render() {
    // 修改这行下面的代码
    return (
      <div style={styles}>Style Me!</div>
    );
    // 修改这行上面的代码
  }
};
```

## Redux：

简介：Redux 是一个状态管理框架，可以与包括 React 在内的许多不同的 Web 技术一起使用。

①创建一个Redux store

Redux`store`是一个保存和管理应用程序状态的`state`， 可以使用 Redux 对象中的`createStore()`来创建一个 redux`store`， 此方法将`reducer`函数作为必需参数，`reducer`函数将在后面的挑战中介绍。该函数已在代码编辑器中为你定义， 它只需将`state`作为参数并返回一个`state`即可。

```
const reducer = (state = 5) => {
  return state;
}
const store = Redux.createStore(reducer)
```

简写

```
const store = Redux.createStore(
  (state = 5) => state
);

let currentState=store.getState()
```

②创建一个Redux Action

```
const action={
  type:'LOGIN'  
}
```

③定义一个Action Creater

```
const action = {
  type: 'LOGIN'
}
// 在这里定义一个动作创建器：
function actionCreator(){
  return action
}
```

④分发action event并在store处理Action

`4.1`分发action event

`dispatch`方法用于将 action 分派给 Redux store， 调用`store.dispatch()`将从 action creator 返回的值发送回 store。

```
const store = Redux.createStore(
  (state = {login: false}) => state
);

const loginAction = () => {
  return {
    type: 'LOGIN'
  }
};

// 在这里发送 action：
store.dispatch(loginAction());
```

4.2store处理Action

Redux 中的 Reducers 负责响应 action 然后进行状态的修改。`reducer`将`state`和`action`作为参数，并且它总是返回一个新的`state`。

```
const defaultState = {
  login: false
};

const reducer = (state = defaultState, action) => {
  // 修改这行下面的代码
 if (action.type === "LOGIN") {
    return {
      login: true
    };
  } else {
    return state;
  }
  // 修改这行上面的代码
};

const store = Redux.createStore(reducer);

const loginAction = () => {
  return {
    type: 'LOGIN'
  }
};
```

⑤使用const声明

```
const LOGIN='LOGIN';
const LOGOUT='LOGOUT';
```

⑥注册Store监听器

在 Redux`store`对象上访问数据的另一种方法是`store.subscribe()`。

这允许将监听器函数订阅到 store，只要 action 被 dispatch 就会调用它们。 这个方法的一个简单用途是为 store 订阅一个函数，它只是在每次收到一个 action 并且更新 store 时记录一条消息。

```
  const add = () => (count+=1);
  store.subscribe(add);
```

⑦组合多个reducer

Redux 的第一个原则：所有应用程序状态都保存在 store 中的一个简单的 state 对象中。

因此，Redux 提供 reducer 组合作为复杂状态模型的解决方案。 定义多个 reducer 来处理应用程序状态的不同部分，然后将这些 reducer 组合成一个 root reducer。 然后将 root reducer 传递给 Redux`createStore()`方法。

```
const rootReducer = Redux.combineReducers({
  auth:authReducer,
  count:counterReducer
})
```

⑧发送Action Data给Store

```
const ADD_NOTE = 'ADD_NOTE';

const notesReducer = (state = 'Initial State', action) => {
  switch(action.type) {
    // 修改这行下面的代码
    case 'ADD_NOTE':{
      return action.text
    }
    // 修改这行上面的代码
    default:
      return state;
  }
};

const addNoteText = (note) => {
  // 修改这行下面的代码
    return {
      type:ADD_NOTE,
      text:note
    }
  // 修改这行上面的代码
};

const store = Redux.createStore(notesReducer);

console.log(store.getState());
store.dispatch(addNoteText('Hello!'));
console.log(store.getState());
```

⑨使用Object.assign拷贝对象

处理对象的一个常用的方法是`Object.assign()`。`Object.assign()`获取目标对象和源对象，并将源对象中的属性映射到目标对象。 任何匹配的属性都会被源对象中的属性覆盖。 通常用于通过传递一个空对象作为第一个参数，然后是要用复制的对象来制作对象的浅表副本。 示例:

```
const newObject = Object.assign({}, obj1, obj2);
```

这会创建`newObject`作为新的`object`，其中包含`obj1`和`obj2`中当前存在的属性。

#### React和Redux配合

参考链接：学习 React and Redux: React 和 Redux 入门 | freeCodeCamp.org

刷题

我们要先弄清楚React和Redux配合我们要弄清楚他们的关键原则是什么。

React 是提供数据的视图库，能以高效、可预测的方式渲染视图。 Redux 是状态管理框架，可用于简化 APP 应用状态的管理。 在 React Redux app 应用中，通常可创建单一的 Redux store 来管理整个应用的状态。 React 组件仅订阅 store 中与其角色相关的数据， 可直接从 React 组件中分发 actions 以触发 store 对象的更新。

React 组件可以在本地管理自己的状态，但是对于复杂的应用来说，它的状态最好是用 Redux 保存在单一位置，有特定本地状态的独立组件例外。 当单个组件可能仅具有特定于其的本地状态时，算是例外。 最后一点是，Redux 没有内置的 React 支持，需要安装`react-redux`包， 通过这个方式把 Redux 的`state`和`dispatch`作为`props`传给组件。

①入门

从`DisplayMessages`组件开始。 把构造函数添加到此组件中，使用含两个属性的状态初始化该组件，这两个属性为：`input`（设置为空字符串），`messages`（设置为空数组）。

```
class DisplayMessages extends React.Component {
  // 修改这行下面的代码
  constructor(props){
    super(props);
    this.state = {
      input :'',
      messages:[]
    }
  }

  // 修改这行上面的代码
  render() {
    return <div />
  }
};
```

②首先在本地管理状态

这一关的任务是完成`DisplayMessages`组件的创建。

首先，在`render()`方法中，让组件渲染`input`、`button`、`ul`三个元素。`input`元素的改变会触发`handleChange()`方法。 此外，`input`元素会渲染组件状态中`input`的值。 点击按钮`button`需触发`submitMessage()`方法。

接着，写出这两种方法。`handleChange()`方法会更新`input`为用户正在输入的内容。`submitMessage()`方法把当前存储在`input`的消息与本地状态的`messages`数组连接起来，并清除`input`的值。

最后，在`ul`中展示`messages`数组，其中每个元素内容需放到`li`元素内。

```
class DisplayMessages extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      input: '',
      messages: []
    }
    this.handleChange = this.handleChange.bind(this);
    this.submitMessage = this.submitMessage.bind(this);
  }
  // 在这里添加 handleChange() 和 submitMessage() 方法
handleChange(event){
  this.setState({
    input:event.target.value
  });
}
submitMessage(){
  this.setState({
    input:'',
    messages:[...this.state.messages,this.state.input]
  });
}

  render() {
    return (
      <div>
        <h2>Type in a new Message:</h2>
        { /* 在这一行下面渲染一个输入框（input），按钮（button）和列表（ul） */ }
          <input value={this.state.input} onChange={this.handleChange}/>
          <button type="submit" onClick={this.submitMessage}></button>
          <ul>{this.state.messages.map(i => <li key={i+1}>{i}</li>)}</ul>
        { /* 修改这行上面的代码 */ }
      </div>
    );
  }
};
```

③提取逻辑状态给Redux

完成 React 组件后，我们需要把在本地`state`执行的逻辑移到 Redux 中， 这是为小规模 React 应用添加 Redux 的第一步。 该应用的唯一功能是把用户的新消息添加到无序列表中。 下面我们用简单的示例来演示 React 和 Redux 之间的配合。

```
// 定义 ADD、addMessage()、messageReducer() 并在这里存储：
const ADD='ADD'
const addMessage = (message)=>{
  return {
    type:ADD,
    message:message
  };
}

const messageReducer = (state=[],action)=>{
  switch(action.type){
    case ADD:return state.concat(action.message);
    default:return state;
  }
}

const store = Redux.createStore(messageReducer);
```

后续明日再战

> 原载 [CSDN](https://blog.csdn.net/weixin_52400878/article/details/119967433)，同步至本站。
