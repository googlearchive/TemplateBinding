## Experimental: MDV Syntax

MDV now includes an experimental (and optional) syntax (using the template element syntax API) which can do things like named scopes and simple inline expressions. For now, in order to enable the MDV syntax you must register it and require its use:

 * Include the implementation:

```HTML
<script src="src/mdv_syntax.js"></script>
```

 * Register the syntax:

```JavaScript
HTMLTemplateElement.syntax['MDV'] = MDVSyntax;
```

 * Use the syntax in your templates

```HTML
<template bind syntax="MDV">
  <template repeat="{{ user in users }}">
    {{ user.name }} <div hidden="{{ user.age < 21 }}">Can have a drink!</div>
  </template>
</template>
```

## Features

### Inline expressions

The MDV syntax allows for inline expressions within bindings which support a strict subset of the JavaScript language. In order to use this feature, it's important to understand its behavior and limitations:

 * The goal for inline expressions is to allow the expression of simple value concepts and relationships. It is generally bad practice to put complex logic into your HTML (view).
 * Expressions are never run (e.g. eval) as page script. They cannot access any global state (e.g. window). They are parsed and converted to a simple interpretted form which is provided the present values of paths contained in the expression.

The specific subset of JavaScript which is supported is:

 * Identifiers & paths, e.g. 'foo', 'foo.bar.baz'. These values are treated as relative to the local model, extracted, observed for changes and cause the expression to be re-evaluated if one or more has changed.
 * The logical not operator: !
 * The unary operators: + (Convert to Number), - (Convert to Number and negate).
 * The binary operators: + (Addition), - (Subtraction), * (Multiplication), / (Division), % (Modulo).
 * Comparators: < (less than), > (greater than), <= (less than or equal), >= (greater then or equal), == (equal), != (not equal), === (identity equally), !== (identity inequality)
 * Logical comparators: || (or), && (and)
 * Conditional statements: ?. e.g. 'a ? b : c'.
 * Grouping (parenthesis): e.g. '(a + b) * (c + d)'
 * Literal values: e.g. numbers, strings, null, undefined. Note that escaped strings and non-decimal numbers are not supported.
 * Array & Object initializers: e.g. '[foo, 1]', '{ id: 1, foo: bar }'
 * Labeled statements: e.g. 'foo: bar.baz; bat: boo > 2'
 
When an expression is used within a mustach (`{{` `}}`), it is parsed. The expression should be a single statement, or multiple labeled statements.

* If the result is a single unlabeled statement, whenever the value of one or more paths in the expression change, the value of the expression re-evaluated and the result inserted as the value of the mustache. e.g.

```HTML
<div>Jill has {{ daughter.children.length + son.children.length }} grandchildren</div>
```

* If the result is one or more labeled statements, the value of the mustache will include the set of space-separated label identifiers whose corresponding expressions are truthy. e.g.

```HTML
<div class="{{ active: user.selected; big: user.type == 'super' }}"> 
```

### Named scope

Named scopes are the solution to wanting to reference a model value from an "outer" model "scope". e.g.

```HTML
<template repeat="{{ user in users }}">
  {{ user.name }}
  <template repeat="{{ file in user.files }}">
    {{ user.name }} owners {{ file.name }}
  </template>
</template>
```

The scope naming is available (but optional) inside `template` `bind` and `repeat` directives.

 * `bind` syntax: `<template bind="{{ expression as identifier }}">`
 * `repeat` syntax: `<template repeat="{{ identifier in expression }}">`

Note that `expression` can be a simple identifier, a path or a full expression (including Object and Array literals).

Within a `template` instance produced by a template using a named scope, all ancestor scopes are visible, up-to and including the first ancestor NOT using a named scope. e.g.

```HTML
<template bind="{{ foo as foo }}">
  <!-- foo.* available -->
  <template bind="{{ foo.bar as bar }}">
    <!-- foo.* & bar.* available -->
    <template bind="{{ bar.bat }}">
      <!-- only properties of bat are available -->
      <template bind="{{ boo as bot }}">
        <!-- bot.* and properties of bat are available. NOT foo.* or bar.* -->
      </template>
    </template>
  </template>
</template>
```
