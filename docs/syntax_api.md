## Learn the tech

### Why MDV Pluggable Syntax?

MDV's native features enables a wide-range of use cases, but (by design) don't attempt to implement many specialized behaviors that some MV* frameworks suport. For example:

* Inline-expressions within mustaches, e.g.:

```html
<span>{{ foo + bar ? foo : bar }}</span>
```

* "Named scopes" for iterators, e.g.:

```html
<template repeat="{{ user in users }}">
  {{ user.name }}
</template>
```

* ... And anything else you'd like.

Enabling these features in MDV is a matter of implementing and registering a binding delegate.

### Basic usage

```JavaScript
templateElement.bindingDelegate = {
  getBinding: function(model, path, name, node) {
    // If this function is defined, the syntax can override
    // the default binding behavior
  },
  getInstanceModel: function(template, model) {
    // If this function is defined, the syntax can override
    // what model is used for each template instance which is
    // produced.
  }
}
```

### getBinding

The `getBinding` method allows for a custom interpretation of the contents of mustaches (`{{` ... `}}`).

When a template is inserting an instance, it will invoke the `getBinding` method (if it is implemented by the syntax) for each mustache which is encountered. The function is invoked with four arguments:

```JavaScript
syntax.getBinding = function(model, path, name, node);
```

* `model`: The data context for which this instance is being created.
* `path`: The text contents (trimmed of outer whitespace) of the mustache.
* `name`: The context in which the mustache occurs. Within element attributes, this will be the name of the attribute. Within text, this will be 'textContent'.
* `node`: A reference to the node to which this binding will be created.

If the `getBinding` method wishes to handle binding, it is required to return an object which has at least a `value` property. If it does, then MDV will call

```JavaScript
node.bind(name, retval, 'value');
```

...on the node.

If the 'getBinding' wishes to decline to override, it should not return a value.

### getInstanceModel

The `getInstanceModel` method allows a syntax to provide an alterate model than the one the template would otherwise use when producing an instance.

When a template is about to create an instance, it will invoke the `getInstanceModel` method (if it is implemented by the syntax). The function is invoked with two arguments:

```JavaScript
syntax.getBinding = function(template, model);
```
* `template`: The template element which is about to create and insert an instance.
* `model`: The data context for which this instance is being created.

The template element will always use the return value of `getInstanceModel` as the model for the new instance. If the syntax does not wish to override the value, it should simply return the `model` value it was passed.

### CompoundBinding

MDV contains a helper object which is useful for the implementation of a Binding Delegate.

```JavaScript
var combinatorFunction = function(values) {
  var combinedValue;
  // compute combinedValue based on the current values which are provided
  return combinedValue;
};

var binding = new CompoundBinding(combinatorFunction);

binding.bind('name1', obj1, path1);
binding.bind('name2', obj2, path2);
//...
binding.bind('nameN', objN, pathN);
```

`CompoundBinding` is an object which knows how to listen to multiple path values (registered via `bind`) and invoke its `combinatorFunction` when one or more of the values have changed and set its `value` property to the return value of the function. When any value has changed, all current values are provided to the `combinatorFunction` in the single `values` argument.

## Not-yet-implemented delegation functions

* `getInstanceFragment`: used to override the DOM of the instance fragent which is a produced for a new instance.
