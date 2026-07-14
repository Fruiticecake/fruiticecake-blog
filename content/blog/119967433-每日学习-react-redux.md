---
title: "每日学习（React，Redux）"
date: 2021-08-28
summary: "此系列文章用来记录我的学习历程。 今日任务： fcc: 1.React 2.React和Redux配合 3.Redux React 简介 React 是由 Facebook 创建和维护的开源视图库。 它是渲染现代 Web 应用程序用户界面（"
tags: ["CSDN同步", "react.js"]
slug: 119967433-每日学习-react-redux
source: "https://blog.csdn.net/weixin_52400878/article/details/119967433"
html: true
---

<p>此系列文章用来记录我的学习历程。</p>

<p></p>

<p>今日任务：</p>

<p>fcc:</p>

<p>1.React</p>

<p>2.React和Redux配合</p>

<p>3.Redux</p>

<p></p>

<h1>React</h1>

<p>简介</p>

<p>React 是由 Facebook 创建和维护的开源视图库。 它是渲染现代 Web 应用程序用户界面（UI）的好工具。</p>

<p>React 使用名为 JSX 的 JavaScript 语法扩展，可以直接在 JavaScript 中编写 HTML。</p>

<p>因为 JSX 是 JavaScript 的语法扩展，所以实际上可以直接在 JSX 中编写 JavaScript。要做到这一点，只需在花括号中包含希望被视为 JavaScript 的代码：</p>

<pre>
<code>{ 'this is treated as JavaScript code' }</code></pre>

<p></p>

<h2>Ract基础:</h2>

<p>①简单的编写</p>

<p>要点:</p>

<p>关于嵌套的 JSX，需要知道的一件重要的事情，那就是它必须返回单个元素。</p>

<p>这个父元素将包裹所有其他级别的嵌套元素。</p>

<p>示例:</p>

<pre>
<code>//有效示例

&lt;div&gt;
  &lt;p&gt;a&lt;/p&gt;
  &lt;p&gt;b&lt;/p&gt;
  &lt;p&gt;c&lt;/p&gt;
&lt;/div&gt;

//无效示例

&lt;p&gt;a&lt;/p&gt;
&lt;p&gt;b&lt;/p&gt;
&lt;p&gt;c&lt;/p&gt;


</code></pre>

<p>②在JSX中注释</p>

<p>使用{/* */}语法注释</p>

<pre>
<code>const JSX = (
  &lt;div&gt;
    {/*    
    &lt;h1&gt;This is a block of JSX&lt;/h1&gt;
    &lt;p&gt;Here's a subtitle&lt;/p&gt;
    */}
  &lt;/div&gt;
);</code></pre>

<p>③渲染HTML元素为DOM树</p>

<p>方法：ReactDOM.render(componentToRender, targetNode)</p>

<p>其中第一个参数是要渲染的 React 元素或组件，第二个参数是组件将要渲染到的 DOM 节点。</p>

<p>代码编辑器中有一个简单的 JSX 组件。使用<code>document.getElementById()</code> 来选择要渲染到的 DOM 节点。</p>

<p>示例：渲染ID为'challenge-node'</p>

<pre>
<code>ReactDOM.render(JSX,document.getElementById('challenge-node'))</code></pre>

<p>④用className作为类关键字</p>

<p>JSX和JavaScript不同，不能用class命名类，要使用className</p>

<pre>
<code>const JSX = (
  &lt;div className="myDiv"&gt;
    &lt;h1 &gt;Add a class to this div&lt;/h1&gt;
  &lt;/div&gt;
);</code></pre>

<p>⑤创建一个React组件</p>

<p>定义 React 组件的另一种方法是使用 ES6 的 <code>class</code>语法。 在以下示例中，<code>Kitten</code> 扩展了<code>React.Component</code>：</p>

<pre>
<code>class Kitten extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return (
      &lt;h1&gt;Hi&lt;/h1&gt;
    );
  }
}</code></pre>

<p>⑥使用React渲染嵌套组件</p>

<p>在render之后加入标签即可&lt;组件名称 /&gt;</p>

<pre>
<code>class Kitten extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return (
      &lt;h1&gt;Hi&lt;/h1&gt;
      &lt;zujian /&gt;
    );
  }
}</code></pre>

<p>⑦将class组件渲染到DOM树</p>

<p>语法： <code>ReactDOM.render(componentToRender, targetNode)</code>。 第一个参数是要渲染的 React 组件。 第二个参数是要在其中渲染该组件的 DOM 节点。</p>

<p>传递到<code>ReactDOM.render()</code> 的React 组件与 JSX 元素略有不同。 对于 JSX 元素，传入的是要渲染的元素的名称。 但是，对于 React 组件，需要使用与渲染嵌套组件相同的语法，例如<code>ReactDOM.render(&lt;ComponentToRender /&gt;, targetNode)</code>。 此语法用于 ES6 class 组件和函数组件都可以。</p>

<p>在后台引入了 <code>Fruits</code> 和 <code>Vegetables</code> 组件。 将两个组件渲染为 <code>TypesOfFood</code> 组件的子组件，然后将 <code>TypesOfFood</code> 渲染到 DOM 节点， 在这个挑战中，请渲染到 <code>id='challenge-node'</code>的 <code>div</code> 中。</p>

<pre>
<code>class TypesOfFood extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      &lt;div&gt;
        &lt;h1&gt;Types of Food:&lt;/h1&gt;
        {/* 修改这行下面的代码 */}
            &lt; Fruits /&gt;
            &lt; Vegetables /&gt;
        {/* 修改这行上面的代码 */}
      &lt;/div&gt;
    );
  }
};

// 修改这行下面的代码
ReactDOM.render(&lt;TypesOfFood/&gt;,document.getElementById("challenge-node"));</code></pre>

<p></p>

<p></p>

<p></p>

<p>⑧props</p>

<p>1.访问props</p>

<p>无状态函数组件：</p>

<p>假设有一个 <code>App</code> 组件，该组件渲染了一个名为 <code>Welcome</code> 的子组件，它是一个无状态函数组件。 可以通过以下方式给 <code>Welcome</code> 传递一个 <code>user</code> 属性：</p>

<pre>
<code>&lt;App&gt;
  &lt;Welcome user='Mark' /&gt;
&lt;/App&gt;</code></pre>

<p>由于 <code>Welcome</code> 是一个无状态函数组件，它可以像这样访问该值：</p>

<pre>
<code>const Welcome = (props) =&gt; &lt;h1&gt;Hello, {props.user}!&lt;/h1&gt;</code></pre>

<p>ES6 类组件：</p>

<p>任何时候，如果要引用类组件本身，可以使用 <code>this</code> 关键字。 要访问类组件中的 props，需要在在访问它的代码前面添加 <code>this</code>。 例如，如果 ES6 类组件有一个名为 <code>data</code> 的 prop，可以在 JSX 中这样写：</p>

<pre>
<code>{this.props.data}</code></pre>

<p>2.PropTypes定义props类型</p>

<p>React 提供了有用的类型检查特性，以验证组件是否接收了正确类型的 props。 例如，应用程序调用 API 来检索数据是否是数组，然后将数据作为 prop 传递给组件。 可以在组件上设置 <code>propTypes</code>，以要求数据的类型为 <code>array</code>。 当数据是任何其它类型时，都会抛出警告。</p>

<p>当提前知道 prop 的类型时，最佳实践是设置其 <code>propTypes</code>。 可以为组件定义 <code>propTypes</code> 属性，方法与定义 <code>defaultProps</code> 相同。 这样做将检查给定键的 prop 是否是给定类型。 这里有一个示例，表示名为 <code>handleClick</code> 的 prop 应为 <code>function</code> 类型：</p>

<pre>
<code>MyComponent.propTypes = { handleClick: PropTypes.func.isRequired }</code></pre>

<p></p>

<p></p>

<p>小练习：</p>

<p></p>

<p>1.创建一个可以控制的输入框</p>

<p> 通常，如果 React 组件具有用户可以键入的输入字段，那么它将是一个受控的输入表单。</p>

<p>代码编辑器具有一个名为 <code>ControlledInput</code> 的组件框架，用于创建受控的 <code>input</code> 元素。 组件的 <code>state</code> 已经被包含空字符串的 <code>input</code> 属性初始化。 此值表示用户在 <code>input</code> 字段中键入的文本。</p>

<pre>
<code>class ControlledInput extends React.Component {
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
      &lt;div&gt;
        { /* 修改这行下面的代码 */}
        &lt;input value={this.state.input} onChange = {this.handleChange.bind(this)}/&gt;
        { /* 修改这行上面的代码 */}
        &lt;h4&gt;Controlled Input:&lt;/h4&gt;
        &lt;p&gt;{this.state.input}&lt;/p&gt;
      &lt;/div&gt;
    );
  }
};</code></pre>

<p>在输入框中键入时，文本由 <code>handleChange()</code> 方法处理，文本被设置为本地 <code>state</code> 中的 <code>input</code> 属性，并渲染在页面上的 <code>input</code> 框中。 组件 <code>state</code> 是输入数据的唯一真实来源。</p>

<p></p>

<p>2.创建一个可以控制的表单</p>

<pre>
<code>class MyForm extends React.Component {
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
      &lt;div&gt;
        &lt;form onSubmit={this.handleSubmit}&gt;
          {/* 修改这行下面的代码 */}
          &lt;input value={this.state.input} onChange={this.handleChange}/&gt;
          {/* 修改这行上面的代码 */}
          &lt;button type='submit'&gt;Submit!&lt;/button&gt;
        &lt;/form&gt;
        {/* 修改这行下面的代码 */}
        &lt;h1&gt;{this.state.submit}&lt;/h1&gt;
        {/* 修改这行上面的代码 */}
      &lt;/div&gt;
    );
  }
}</code></pre>

<p><strong>注意：</strong> 还必须在提交处理程序中调用 <code>event.preventDefault()</code>，以防止将会刷新网页的默认的表单提交行为。</p>

<p>⑨React组件中的特殊方法：</p>

<p>生命周期方法</p>

<pre>
<code>componentWillMount() 
componentDidMount() 
shouldComponentUpdate() 
componentDidUpdate() 
componentWillUnmount()
………………</code></pre>

<p>1.componentWillMount()函数</p>

<p>        当组件被挂载到 DOM 时，<code>componentWillMount()</code> 方法在 <code>render()</code> 方法之前被调用。 在<code>componentWillMount()</code>中将一些内容记录到控制台 -- 可能需要打开浏览器控制台以查看输出。</p>

<p>2.componentDidMount()函数</p>

<p>        某些时候，大多数 web 开发人员需要调用 API 接口来获取数据。 如果正在使用 React，知道在哪里执行这个动作是很重要的。</p>

<p>        React 的最佳实践是在生命周期方法 <code>componentDidMount()</code> 中对服务器进行 API 调用或任何其它调用。 将组件装载到 DOM 后会调用此方法。 此处对 <code>setState()</code> 的任何调用都将触发组件的重新渲染。 在此方法中调用 API 并用 API​​ 返回的数据设置 state 时，一旦收到数据，它将自动触发更新。</p>

<pre>
<code>  componentDidMount() {
    setTimeout(() =&gt; {
      this.setState({
        activeUsers: 1273
      });
    }, 2500);
  }</code></pre>

<p>3.在React中添加内联样式</p>

<pre>
<code>const styles = {
  color: 'purple',
  fontSize: 40,
  border: "2px solid purple",
};


// 修改这行上面的代码
class Colorful extends React.Component {
  render() {
    // 修改这行下面的代码
    return (
      &lt;div style={styles}&gt;Style Me!&lt;/div&gt;
    );
    // 修改这行上面的代码
  }
};</code></pre>

<p></p>

<p></p>

<h1>Redux：</h1>

<p>简介：Redux 是一个状态管理框架，可以与包括 React 在内的许多不同的 Web 技术一起使用。</p>

<p></p>

<p>①创建一个Redux store</p>

<p>Redux <code>store</code> 是一个保存和管理应用程序状态的<code>state</code>， 可以使用 Redux 对象中的 <code>createStore()</code> 来创建一个 redux <code>store</code>， 此方法将 <code>reducer</code> 函数作为必需参数， <code>reducer</code> 函数将在后面的挑战中介绍。该函数已在代码编辑器中为你定义， 它只需将 <code>state</code> 作为参数并返回一个 <code>state</code> 即可。</p>

<pre>
<code>const reducer = (state = 5) =&gt; {
  return state;
}
const store = Redux.createStore(reducer)</code></pre>

<p>简写</p>

<pre>
<code>const store = Redux.createStore(
  (state = 5) =&gt; state
);

let currentState=store.getState()</code></pre>

<p>②创建一个Redux Action</p>

<pre>
<code>const action={
  type:'LOGIN'  
}</code></pre>

<p>③定义一个Action Creater</p>

<pre>
<code>const action = {
  type: 'LOGIN'
}
// 在这里定义一个动作创建器：
function actionCreator(){
  return action
}</code></pre>

<p>④分发action event并在store处理Action</p>

<p><code>4.1</code>分发action event</p>

<p><code>dispatch</code> 方法用于将 action 分派给 Redux store， 调用 <code>store.dispatch()</code> 将从 action creator 返回的值发送回 store。</p>

<pre>
<code>const store = Redux.createStore(
  (state = {login: false}) =&gt; state
);

const loginAction = () =&gt; {
  return {
    type: 'LOGIN'
  }
};

// 在这里发送 action：
store.dispatch(loginAction());</code></pre>

<p>4.2store处理Action</p>

<p> Redux 中的 Reducers 负责响应 action 然后进行状态的修改。 <code>reducer</code> 将 <code>state</code> 和 <code>action</code> 作为参数，并且它总是返回一个新的 <code>state</code>。</p>

<pre>
<code>const defaultState = {
  login: false
};

const reducer = (state = defaultState, action) =&gt; {
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

const loginAction = () =&gt; {
  return {
    type: 'LOGIN'
  }
};</code></pre>

<p>⑤使用const声明</p>

<pre>
<code>const LOGIN='LOGIN';
const LOGOUT='LOGOUT';</code></pre>

<p>⑥注册Store监听器</p>

<p>在 Redux <code>store</code> 对象上访问数据的另一种方法是 <code>store.subscribe()</code>。</p>

<p>这允许将监听器函数订阅到 store，只要 action 被 dispatch 就会调用它们。 这个方法的一个简单用途是为 store 订阅一个函数，它只是在每次收到一个 action 并且更新 store 时记录一条消息。</p>

<pre>
<code>  const add = () =&gt; (count+=1);
  store.subscribe(add);</code></pre>

<p>⑦组合多个reducer</p>

<p> Redux 的第一个原则：所有应用程序状态都保存在 store 中的一个简单的 state 对象中。 </p>

<p>因此，Redux 提供 reducer 组合作为复杂状态模型的解决方案。 定义多个 reducer 来处理应用程序状态的不同部分，然后将这些 reducer 组合成一个 root reducer。 然后将 root reducer 传递给 Redux <code>createStore()</code>方法。</p>

<pre>
<code>const rootReducer = Redux.combineReducers({
  auth:authReducer,
  count:counterReducer
})</code></pre>

<p>⑧发送Action Data给Store</p>

<pre>
<code>const ADD_NOTE = 'ADD_NOTE';

const notesReducer = (state = 'Initial State', action) =&gt; {
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

const addNoteText = (note) =&gt; {
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
console.log(store.getState());</code></pre>

<p>⑨使用Object.assign拷贝对象</p>

<p>处理对象的一个常用的方法是 <code>Object.assign()</code>。 <code>Object.assign()</code> 获取目标对象和源对象，并将源对象中的属性映射到目标对象。 任何匹配的属性都会被源对象中的属性覆盖。 通常用于通过传递一个空对象作为第一个参数，然后是要用复制的对象来制作对象的浅表副本。 示例:</p>

<pre>
<code>const newObject = Object.assign({}, obj1, obj2);</code></pre>

<p>这会创建 <code>newObject</code> 作为新的 <code>object</code>，其中包含 <code>obj1</code> 和 <code>obj2</code> 中当前存在的属性。</p>

<p></p>

<h3>React和Redux配合</h3>

<p>参考链接：<a href="https://chinese.freecodecamp.org/learn/front-end-libraries/react-and-redux/getting-started-with-react-redux">学习 React and Redux: React 和 Redux 入门 | freeCodeCamp.org</a></p>

<p>刷题</p>

<p></p>

<p>我们要先弄清楚React和Redux配合我们要弄清楚他们的关键原则是什么。 </p>

<p>        React 是提供数据的视图库，能以高效、可预测的方式渲染视图。 Redux 是状态管理框架，可用于简化 APP 应用状态的管理。 在 React Redux app 应用中，通常可创建单一的 Redux store 来管理整个应用的状态。 React 组件仅订阅 store 中与其角色相关的数据， 可直接从 React 组件中分发 actions 以触发 store 对象的更新。</p>

<p>        React 组件可以在本地管理自己的状态，但是对于复杂的应用来说，它的状态最好是用 Redux 保存在单一位置，有特定本地状态的独立组件例外。 当单个组件可能仅具有特定于其的本地状态时，算是例外。 最后一点是，Redux 没有内置的 React 支持，需要安装 <code>react-redux</code>包， 通过这个方式把 Redux 的 <code>state</code> 和 <code>dispatch</code> 作为 <code>props</code> 传给组件。</p>

<p></p>

<p>①入门</p>

<p>从 <code>DisplayMessages</code> 组件开始。 把构造函数添加到此组件中，使用含两个属性的状态初始化该组件，这两个属性为：<code>input</code>（设置为空字符串），<code>messages</code>（设置为空数组）。</p>

<pre>
<code>class DisplayMessages extends React.Component {
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
    return &lt;div /&gt;
  }
};</code></pre>

<p>②首先在本地管理状态</p>

<p>这一关的任务是完成 <code>DisplayMessages</code> 组件的创建。</p>

<p>首先，在 <code>render()</code> 方法中，让组件渲染 <code>input</code>、<code>button</code>、<code>ul</code> 三个元素。 <code>input</code> 元素的改变会触发 <code>handleChange()</code> 方法。 此外，<code>input</code> 元素会渲染组件状态中 <code>input</code> 的值。 点击按钮 <code>button</code> 需触发 <code>submitMessage()</code> 方法。</p>

<p>接着，写出这两种方法。 <code>handleChange()</code> 方法会更新 <code>input</code> 为用户正在输入的内容。 <code>submitMessage()</code> 方法把当前存储在 <code>input</code> 的消息与本地状态的 <code>messages</code> 数组连接起来，并清除 <code>input</code> 的值。</p>

<p>最后，在 <code>ul</code> 中展示 <code>messages</code> 数组，其中每个元素内容需放到 <code>li</code> 元素内。</p>

<pre>
<code>class DisplayMessages extends React.Component {
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
      &lt;div&gt;
        &lt;h2&gt;Type in a new Message:&lt;/h2&gt;
        { /* 在这一行下面渲染一个输入框（input），按钮（button）和列表（ul） */ }
          &lt;input value={this.state.input} onChange={this.handleChange}/&gt;
          &lt;button type="submit" onClick={this.submitMessage}&gt;&lt;/button&gt;
          &lt;ul&gt;{this.state.messages.map(i =&gt; &lt;li key={i+1}&gt;{i}&lt;/li&gt;)}&lt;/ul&gt;
        { /* 修改这行上面的代码 */ }
      &lt;/div&gt;
    );
  }
};</code></pre>

<p>③提取逻辑状态给Redux</p>

<p>完成 React 组件后，我们需要把在本地 <code>state</code> 执行的逻辑移到 Redux 中， 这是为小规模 React 应用添加 Redux 的第一步。 该应用的唯一功能是把用户的新消息添加到无序列表中。 下面我们用简单的示例来演示 React 和 Redux 之间的配合。</p>

<pre>
<code>// 定义 ADD、addMessage()、messageReducer() 并在这里存储：
const ADD='ADD'
const addMessage = (message)=&gt;{
  return {
    type:ADD,
    message:message
  };
}

const messageReducer = (state=[],action)=&gt;{
  switch(action.type){
    case ADD:return state.concat(action.message);
    default:return state;
  }
}

const store = Redux.createStore(messageReducer);</code></pre>

<p></p>

<p>后续明日再战</p>

<p></p>

<p></p>

<p></p>

<p></p>

<p></p>

<p></p>
<p class="source-note">原文发布于 <a href="https://blog.csdn.net/weixin_52400878/article/details/119967433" target="_blank" rel="noopener noreferrer">CSDN</a>。</p>
