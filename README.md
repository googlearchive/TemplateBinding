## Learn the tech

### What is Model-driven Views?

Model-driven Views (or “MDV” for short) is a way to write _dynamic_ HTML _using_ HTML. It is currently available as a JavaScript library and we hope to eventually make it a web standard which is natively implemented by browsers.

There’s plenty of detail, but it all hinges on the `<template>` element. Let’s walk through a simple [example] [1] which demonstrates the basics.

  [1]: https://github.com/toolkitchen/mdv/blob/master/sample.html

```HTML
<head>
  <script src="src/mdv.js"></script>
</head>
<body>
  <h1>Model-driven Views</h1>
  <ul>
    <template id="greeting" repeat="{{ salutations }}">
      <li>{{ what }}: <input type="text" value="{{ who }}"></li>
    </template>
  </ul>
<script>
var t = document.getElementById('greeting');
var model = {
  salutations: [
    { what: 'Hello', who: 'World' },
    { what: 'GoodBye', who: 'DOM APIs' },
    { what: 'Hello', who: 'Declarative' },
    { what: 'GoodBye', who: 'Imperative' }
  ]
};
HTMLTemplateElement.bindTree(t, model);
</script>
<body>
```

This example should look mostly familiar to anyone who knows HTML, but there are a couple novel things going on:

#### The `<template>` element

The [HTML Template element] [1] is new and browsers are in the process of implementing it. It [allows] [2] you to declare fragments of HTML that may be used at some point. The [Chrome Inspector] [3] allows you see the [content] [4] of a template element.

  [1]: http://www.w3.org/TR/html-templates/
  [2]: http://www.html5rocks.com/en/tutorials/webcomponents/template/
  [3]: https://developers.google.com/chrome-developer-tools/docs/overview
  [4]: http://www.w3.org/TR/html-templates/#api-html-template-element-content
  
![ScreenShot](https://raw.github.com/toolkitchen/mdv/master/docs/images/README/templateContent.png)

If you loaded the above example without `<script src="src/mdv.js"></script>`, that’s about all `<template>` would do.

However, the MDV library teaches `<template>` some new tricks. With MDV, `<template>` knows how to:

* Instruct DOM nodes to derive their value from JavaScript data by binding them to the data provided.
* Maintain a fragment of DOM (or “instance fragment”) for each item in an array. 
* Conditionally stamp out one or more instance fragments, based on whether  some data value is true or not.
* ...And lots more.

But back to the example. Our template...

```HTML
<template id="greeting" repeat="{{ salutations }}">
  <li>{{ what }}: <input type="text" value="{{ who }}"></li>
</template>
```

...defines what each instance will look like when stamped out. In this case, it contains a `<li>` with a text node and an `<input>` as its children. The mustaches `{{` ... `}}` mean _“bind data here”_. The `repeat=”{{ salutations }}”` tells the template to ensure there is one instance fragment for each element in the salutations array.

In `<script>`, we create a model

```JavaScript
var model = {
  salutations: [
    { what: 'Hello', who: 'World' },
    { what: 'GoodBye', who: 'DOM APIs' },
    { what: 'Hello', who: 'Declarative' },
    { what: 'GoodBye', who: 'Imperative' }
  ]
};
```

Notice that this is just JavaScript data: _there’s no need to import your data into special observable objects_. The template is set in motion by binding the model data to it:

```JavaScript
HTMLTemplateElement.bindTree(t, model);
```

Now the template is off to the races. Here’s the result:

![ScreenShot](https://raw.github.com/toolkitchen/mdv/master/docs/images/README/output.png)

and here’s what the DOM looks like:

![ScreenShot](https://raw.github.com/toolkitchen/mdv/master/docs/images/README/DOM.png)

You can see that the template stamped out four instances immediately following its position in the document. All nodes within an instance have a property called `templateInstance` which points to an instance descriptor. The descriptor indicates the extent (first and last nodes) of the instance, as well as the `model` data for which the instance was produced:

![ScreenShot](https://raw.github.com/toolkitchen/mdv/master/docs/images/README/templateInstance.png)

Now, remember we said MDV teaches the DOM to derive its values from JavaScript data? If we change a value in our model, the DOM observes the change and updates accordingly:

![ScreenShot](https://raw.github.com/toolkitchen/mdv/master/docs/images/README/updateData.png)

However, the DOM doesn’t just observe data in the model, if DOM elements which collect user input are bound, they _push_ the collected value into the model:

![ScreenShot](https://raw.github.com/toolkitchen/mdv/master/docs/images/README/input.png)

Lastly, let’s look at what happens when we alter the contents of the `model.salutations` array:

![ScreenShot](https://raw.github.com/toolkitchen/mdv/master/docs/images/README/arrayUpdate.png)

The `<template>` is `repeat`ing which means that it ensures there is one instance for each item in the array. We removed two elements from the middle of salutations and inserted one in their place. The `<template>` responded by removing the two corresponding instances and creating a new one in the right location.

Getting the idea? MDV allows you author your HTML _using_ HTML which contains information about _where data goes_ and directives which _control the document’s structure_ -- all depending on the data you provide it.

### Where to go from here?

If you are new to MDV, the best to place to go is to the look at the [How-To Samples] [1]. These are little examples which succinctly demonstrate how to use MDV to accomplish things that frequently are required for real web apps:

  [1]: http://www.w3.org/TR/html-templates/
  
_Binding to DOM values:_

* [Binding to text values] [1]: How to insert values into the DOM that render as text.
* [Binding to attributes] [2]: How to insert values into element attributes
* [Conditional attributes] [3]: How to bind to attributes such that the attribute is only present if the binding value is “truthy”.
* [Binding to input elements] [4]: How to bind bi-directionally with input elements.
* [Custom bindings] [5]: How to implement a custom element which has a specialized interpretation of a binding.

  [1]: http://www.w3.org/TR/html-templates/
  [2]: http://www.w3.org/TR/html-templates/
  [3]: http://www.w3.org/TR/html-templates/
  [4]: http://www.w3.org/TR/html-templates/
  [5]: http://www.w3.org/TR/html-templates/
  
_Using `<template>` to produce DOM structures":_

* [Conditionals] [1]: How to control whether instance fragments are produced based on the value of a binding.
* [Nested templates] [2]: How to accomplish nested template production.
* [Re-using templates] [3]: How to define a template once and use it in more than one location.
* [Recursive templates] [4]: How to produce tree-structure DOM whose depth is dependent on the data to which it is bound.

  [1]: http://www.w3.org/TR/html-templates/
  [2]: http://www.w3.org/TR/html-templates/
  [3]: http://www.w3.org/TR/html-templates/
  [4]: http://www.w3.org/TR/html-templates/
  
### API Reference / Pseudo-specs

MDV is designed to as two primitives which could eventually become standardized and implemented natively in browsers. The following two documents specify their behavior, API and use.

* [Node.bind] [1]: Which describes how DOM nodes are bound to data values
* [`<template>`] [2] instantiation: Which describes how `<template>` manages instance fragments.

  [1]: http://www.w3.org/TR/html-templates/
  [2]: http://www.w3.org/TR/html-templates/
  
### Extending MDV

MDV is mainly concerned with being robust and efficient in interacting with application data and keeping the DOM in sync , but more advanced behaviors can be accomplished via one or both of the following:

* [A Custom Syntax API] [1] 
* [Chained observation] [2]

  [1]: http://www.w3.org/TR/html-templates/
  [2]: http://www.w3.org/TR/html-templates/
  
### Advanced Topics

* [DOM Stability] [1]: MDV makes every effort to maintain the state of DOM nodes (event listeners, expandos, etc...). Understand why this is important and how it works.
* [Imperative DOM mutation] [2]: You should rarely need to directly manipulate the DOM, but if you do, it’s allowed. Learn the simple rules of how MDV will react if you manipulate the DOM it is managing.
* [Asynchronous processing model] [3]: MDV responds asynchronously to changes in data and DOM. Learn why this is good and what it means for your application.

  [1]: http://www.w3.org/TR/html-templates/
  [2]: http://www.w3.org/TR/html-templates/
  [3]: http://www.w3.org/TR/html-templates/
  
### Deployment

MDV builds upon recently added primitives to the Web Platform:

* [ECMAScript Object.observe] [1]
* [The HTML Template Element] [2]
* [DOM Mutation Observers] [3]

  [1]: http://updates.html5rocks.com/2012/11/Respond-to-change-with-Object-observe
  [2]: http://www.w3.org/TR/html-templates/
  [3]: https://developer.mozilla.org/en-US/docs/DOM/MutationObserver
  
Not all browsers currently implement all the required primitives. MDV attempts to polyfil their absence, but targeting browsers which do not support all three requires understanding patterns of use which should be prefered or avoided to ensure proper behavior.

* [Deploying MDV] [1], supported browsers and rough edges

  [1]: http://updates.html5rocks.com/2012/11/Respond-to-change-with-Object-observe


