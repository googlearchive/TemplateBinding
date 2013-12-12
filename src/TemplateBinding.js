// Copyright 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

(function(global) {
  'use strict';

  function assert(v) {
    if (!v)
      throw new Error('Assertion failed');
  }

  var forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach);

  function getTreeScope(node) {
    while (node.parentNode) {
      node = node.parentNode;
    }

    return typeof node.getElementById === 'function' ? node : null;
  }

  var Map;
  if (global.Map && typeof global.Map.prototype.forEach === 'function') {
    Map = global.Map;
  } else {
    Map = function() {
      this.keys = [];
      this.values = [];
    };

    Map.prototype = {
      set: function(key, value) {
        var index = this.keys.indexOf(key);
        if (index < 0) {
          this.keys.push(key);
          this.values.push(value);
        } else {
          this.values[index] = value;
        }
      },

      get: function(key) {
        var index = this.keys.indexOf(key);
        if (index < 0)
          return;

        return this.values[index];
      },

      delete: function(key, value) {
        var index = this.keys.indexOf(key);
        if (index < 0)
          return false;

        this.keys.splice(index, 1);
        this.values.splice(index, 1);
        return true;
      },

      forEach: function(f, opt_this) {
        for (var i = 0; i < this.keys.length; i++)
          f.call(opt_this || this, this.values[i], this.keys[i], this);
      }
    };
  }

  // JScript does not have __proto__. We wrap all object literals with
  // createObject which uses Object.create, Object.defineProperty and
  // Object.getOwnPropertyDescriptor to create a new object that does the exact
  // same thing. The main downside to this solution is that we have to extract
  // all those property descriptors for IE.
  var createObject = ('__proto__' in {}) ?
      function(obj) { return obj; } :
      function(obj) {
        var proto = obj.__proto__;
        if (!proto)
          return obj;
        var newObject = Object.create(proto);
        Object.getOwnPropertyNames(obj).forEach(function(name) {
          Object.defineProperty(newObject, name,
                               Object.getOwnPropertyDescriptor(obj, name));
        });
        return newObject;
      };

  // IE does not support have Document.prototype.contains.
  if (typeof document.contains != 'function') {
    Document.prototype.contains = function(node) {
      if (node === this || node.parentNode === this)
        return true;
      return this.documentElement.contains(node);
    }
  }

  var BIND = 'bind';
  var REPEAT = 'repeat';
  var IF = 'if';

  var templateAttributeDirectives = {
    'template': true,
    'repeat': true,
    'bind': true,
    'ref': true
  };

  var semanticTemplateElements = {
    'THEAD': true,
    'TBODY': true,
    'TFOOT': true,
    'TH': true,
    'TR': true,
    'TD': true,
    'COLGROUP': true,
    'COL': true,
    'CAPTION': true,
    'OPTION': true,
    'OPTGROUP': true
  };

  var hasTemplateElement = typeof HTMLTemplateElement !== 'undefined';

  var allTemplatesSelectors = 'template, ' +
      Object.keys(semanticTemplateElements).map(function(tagName) {
        return tagName.toLowerCase() + '[template]';
      }).join(', ');

  function isAttributeTemplate(el) {
    return semanticTemplateElements[el.tagName] &&
        el.hasAttribute('template');
  }

  function isTemplate(el) {
    return el.tagName == 'TEMPLATE' || isAttributeTemplate(el);
  }

  function isNativeTemplate(el) {
    return hasTemplateElement && el.tagName == 'TEMPLATE';
  }

  var ensureScheduled = function() {
    // We need to ping-pong between two Runners in order for the tests to
    // simulate proper end-of-microtask behavior for Object.observe. Without
    // this, we'll continue delivering to a single observer without allowing
    // other observers in the same microtask to make progress.

    function Runner(nextRunner) {
      this.nextRunner = nextRunner;
      this.value = false;
      this.lastValue = this.value;
      this.scheduled = [];
      this.scheduledIds = [];
      this.running = false;
      this.observer = new PathObserver(this, 'value');
      this.observer.open(this.run, this);
    }

    Runner.prototype = {
      schedule: function(async, id) {
        if (this.scheduledIds[id])
          return;

        if (this.running)
          return this.nextRunner.schedule(async, id);

        this.scheduledIds[id] = true;
        this.scheduled.push(async);

        if (this.lastValue !== this.value)
          return;

        this.value = !this.value;
      },

      run: function() {
        this.running = true;

        for (var i = 0; i < this.scheduled.length; i++) {
          var async = this.scheduled[i];
          var id = async[idExpando];
          this.scheduledIds[id] = false;

          if (typeof async === 'function')
            async();
          else
            async.resolve();
        }

        this.scheduled = [];
        this.scheduledIds = [];
        this.lastValue = this.value;

        this.running = false;
      }
    }

    var runner = new Runner(new Runner());

    var nextId = 1;
    var idExpando = '__scheduledId__';

    function ensureScheduled(async) {
      var id = async[idExpando];
      if (!async[idExpando]) {
        id = nextId++;
        async[idExpando] = id;
      }

      runner.schedule(async, id);
    }

    return ensureScheduled;
  }();

  // FIXME: Observe templates being added/removed from documents
  // FIXME: Expose imperative API to decorate and observe templates in
  // "disconnected tress" (e.g. ShadowRoot)
  document.addEventListener('DOMContentLoaded', function(e) {
    bootstrapTemplatesRecursivelyFrom(document);
    // FIXME: Is this needed? Seems like it shouldn't be.
    Platform.performMicrotaskCheckpoint();
  }, false);

  function forAllTemplatesFrom(node, fn) {
    var subTemplates = node.querySelectorAll(allTemplatesSelectors);

    if (isTemplate(node))
      fn(node)
    forEach(subTemplates, fn);
  }

  function bootstrapTemplatesRecursivelyFrom(node) {
    function bootstrap(template) {
      if (!HTMLTemplateElement.decorate(template))
        bootstrapTemplatesRecursivelyFrom(template.content);
    }

    forAllTemplatesFrom(node, bootstrap);
  }

  if (!hasTemplateElement) {
    /**
     * This represents a <template> element.
     * @constructor
     * @extends {HTMLElement}
     */
    global.HTMLTemplateElement = function() {
      throw TypeError('Illegal constructor');
    };
  }

  var hasProto = '__proto__' in {};

  function mixin(to, from) {
    Object.getOwnPropertyNames(from).forEach(function(name) {
      Object.defineProperty(to, name,
                            Object.getOwnPropertyDescriptor(from, name));
    });
  }

  // http://dvcs.w3.org/hg/webcomponents/raw-file/tip/spec/templates/index.html#dfn-template-contents-owner
  function getOrCreateTemplateContentsOwner(template) {
    var doc = template.ownerDocument
    if (!doc.defaultView)
      return doc;
    var d = doc.templateContentsOwner_;
    if (!d) {
      // TODO(arv): This should either be a Document or HTMLDocument depending
      // on doc.
      d = doc.implementation.createHTMLDocument('');
      while (d.lastChild) {
        d.removeChild(d.lastChild);
      }
      doc.templateContentsOwner_ = d;
    }
    return d;
  }

  function getTemplateStagingDocument(template) {
    if (!template.stagingDocument_) {
      var owner = template.ownerDocument;
      if (!owner.stagingDocument_) {
        owner.stagingDocument_ = owner.implementation.createHTMLDocument('');
        owner.stagingDocument_.stagingDocument_ = owner.stagingDocument_;
      }

      template.stagingDocument_ = owner.stagingDocument_;
    }

    return template.stagingDocument_;
  }

  // For non-template browsers, the parser will disallow <template> in certain
  // locations, so we allow "attribute templates" which combine the template
  // element with the top-level container node of the content, e.g.
  //
  //   <tr template repeat="{{ foo }}"" class="bar"><td>Bar</td></tr>
  //
  // becomes
  //
  //   <template repeat="{{ foo }}">
  //   + #document-fragment
  //     + <tr class="bar">
  //       + <td>Bar</td>
  //
  function extractTemplateFromAttributeTemplate(el) {
    var template = el.ownerDocument.createElement('template');
    el.parentNode.insertBefore(template, el);

    var attribs = el.attributes;
    var count = attribs.length;
    while (count-- > 0) {
      var attrib = attribs[count];
      if (templateAttributeDirectives[attrib.name]) {
        if (attrib.name !== 'template')
          template.setAttribute(attrib.name, attrib.value);
        el.removeAttribute(attrib.name);
      }
    }

    return template;
  }

  function liftNonNativeTemplateChildrenIntoContent(template, el, useRoot) {
    var content = template.content;
    if (useRoot) {
      content.appendChild(el);
      return;
    }

    var child;
    while (child = el.firstChild) {
      content.appendChild(child);
    }
  }

  /**
   * Ensures proper API and content model for template elements.
   * @param {HTMLTemplateElement} opt_instanceRef The template element which
   *     |el| template element will return as the value of its ref(), and whose
   *     content will be used as source when createInstance() is invoked.
   */
  HTMLTemplateElement.decorate = function(el, opt_instanceRef) {
    if (el.templateIsDecorated_)
      return false;

    var templateElement = el;
    templateElement.templateIsDecorated_ = true;

    var isNative = isNativeTemplate(templateElement);
    var bootstrapContents = isNative;
    var liftContents = !isNative;
    var liftRoot = false;

    if (!isNative && isAttributeTemplate(templateElement)) {
      assert(!opt_instanceRef);
      templateElement = extractTemplateFromAttributeTemplate(el);
      templateElement.templateIsDecorated_ = true;

      isNative = isNativeTemplate(templateElement);
      liftRoot = true;
    }

    if (!isNative) {
      fixTemplateElementPrototype(templateElement);
      var doc = getOrCreateTemplateContentsOwner(templateElement);
      templateElement.content_ = doc.createDocumentFragment();
    }

    if (opt_instanceRef) {
      // template is contained within an instance, its direct content must be
      // empty
      templateElement.instanceRef_ = opt_instanceRef;
    } else if (liftContents) {
      liftNonNativeTemplateChildrenIntoContent(templateElement,
                                               el,
                                               liftRoot);
    } else if (bootstrapContents) {
      bootstrapTemplatesRecursivelyFrom(templateElement.content);
    }

    return true;
  };

  // TODO(rafaelw): This used to decorate recursively all templates from a given
  // node. This happens by default on 'DOMContentLoaded', but may be needed
  // in subtrees not descendent from document (e.g. ShadowRoot).
  // Review whether this is the right public API.
  HTMLTemplateElement.bootstrap = bootstrapTemplatesRecursivelyFrom;

  var htmlElement = global.HTMLUnknownElement || HTMLElement;

  var contentDescriptor = {
    get: function() {
      return this.content_;
    },
    enumerable: true,
    configurable: true
  };

  if (!hasTemplateElement) {
    // Gecko is more picky with the prototype than WebKit. Make sure to use the
    // same prototype as created in the constructor.
    HTMLTemplateElement.prototype = Object.create(htmlElement.prototype);

    Object.defineProperty(HTMLTemplateElement.prototype, 'content',
                          contentDescriptor);
  }

  function fixTemplateElementPrototype(el) {
    // Note: because we need to treat some semantic elements as template
    // elements (like tr or td), but don't want to reassign their proto (gecko
    // doesn't like that), we mixin the properties for those elements.
    if (el.tagName === 'TEMPLATE') {
      if (!hasTemplateElement) {
        if (hasProto)
          el.__proto__ = HTMLTemplateElement.prototype;
        else
          mixin(el, HTMLTemplateElement.prototype);
      }
    } else {
      mixin(el, HTMLTemplateElement.prototype);
      // FIXME: Won't need this when webkit methods move to the prototype.
      Object.defineProperty(el, 'content', contentDescriptor);
    }
  }

  function ensureSetModelScheduled(template) {
    if (!template.setModelFn_) {
      template.setModelFn_ = function() {
        addBindings(template, template.model, template.prepareBindingFn_);
      };
    }

    ensureScheduled(template.setModelFn_);
  }

  mixin(HTMLTemplateElement.prototype, {
    bind: function(name, observer) {
      if (!this.iterator_)
        this.iterator_ = new TemplateIterator(this);

      this.bindings = this.bindings || {};
      if (name === 'bind') {
        observer.open(this.iterator_.depsChanged, this.iterator_);
        this.unbind(name);
        this.iterator_.bindObserver = observer;
        this.iterator_.depsChanged();
        return this.bindings.bind = this.iterator_;
      }

      if (name === 'repeat') {
        observer.open(this.iterator_.depsChanged, this.iterator_);
        this.unbind(name);
        this.iterator_.repeatObserver = observer;
        this.iterator_.depsChanged();
        return this.bindings.repeat = this.iterator_;
      }

      if (name === 'if') {
        observer.open(this.iterator_.depsChanged, this.iterator_);
        this.unbind(name);
        this.iterator_.ifObserver = observer;
        this.iterator_.depsChanged();
        return this.bindings.if = this.iterator_;
      }

      return HTMLElement.prototype.bind.call(this, name, observer);
    },

    unbind: function(name) {
      if (name === 'bind') {
        if (!this.iterator_)
          return;

        if (this.iterator_.bindObserver)
          this.iterator_.bindObserver.close();
        this.iterator_.bindObserver = undefined;
        this.iterator_.depsChanged();
        return this.bindings.bind = undefined;
      }

      if (name === 'repeat') {
        if (!this.iterator_)
          return;

        if (this.iterator_.repeatObserver)
          this.iterator_.repeatObserver.close();
        this.iterator_.repeatObserver = undefined;
        this.iterator_.depsChanged();
        return this.bindings.repeat = undefined;
      }

      if (name === 'if') {
        if (!this.iterator_)
          return;

        if (this.iterator_.ifObserver)
          this.iterator_.ifObserver.close();
        this.iterator_.ifObserver = undefined;
        this.iterator_.depsChanged();
        return this.bindings.if = undefined;
      }

      return HTMLElement.prototype.unbind.call(this, name);
    },

    createInstance: function(model, instanceBindings) {
      var content = this.ref.content;
      var map = content.bindingMap_;
      if (!map) {
        // TODO(rafaelw): Setup a MutationObserver on content to detect
        // when the instanceMap is invalid.
        map = createInstanceBindingMap(content, this.prepareBindingFn_) || [];
        content.bindingMap_ = map;
      }

      var stagingDocument = getTemplateStagingDocument(this);
      var instance = deepCloneIgnoreTemplateContent(content, stagingDocument);

      addMapBindings(instance, map, model, this.bindingDelegate_,
                     instanceBindings);
      // TODO(rafaelw): We can do this more lazily, but setting a sentinel
      // in the parent of the template element, and creating it when it's
      // asked for by walking back to find the iterating template.
      addTemplateInstanceRecord(instance, model);
      return instance;
    },

    get model() {
      return this.model_;
    },

    set model(model) {
      this.model_ = model;
      ensureSetModelScheduled(this);
    },

    get bindingDelegate() {
      return this.bindingDelegate_;
    },

    setBindingDelegate_: function(bindingDelegate) {
      this.bindingDelegate_ = bindingDelegate;

      function delegateFn(name) {
        var fn = bindingDelegate && bindingDelegate[name];
        if (typeof fn != 'function')
          return;

        return function() {
          return fn.apply(bindingDelegate, arguments);
        };
      }

      this.prepareBindingFn_ = delegateFn('prepareBinding');
      this.prepareInstanceModelFn_ = delegateFn('prepareInstanceModel');
      this.prepareInstancePositionChangedFn_ =
          delegateFn('prepareInstancePositionChanged');
    },

    set bindingDelegate(bindingDelegate) {
      this.setBindingDelegate_(bindingDelegate);
      ensureSetModelScheduled(this);
    },

    get ref() {
      var ref;
      var refId = this.getAttribute('ref');
      if (refId) {
        var treeScope = getTreeScope(this);
        if (treeScope)
          ref = treeScope.getElementById(refId);
      }

      if (!ref)
        ref = this.instanceRef_;

      if (!ref)
        return this;

      var nextRef = ref.ref;
      return nextRef ? nextRef : ref;
    }
  });

  // Returns
  //   a) undefined if there are no mustaches.
  //   b) [TEXT, (PATH, DELEGATE_FN, TEXT)+] if there is at least one mustache.
  function parseMustaches(s, name, node, prepareBindingFn) {
    if (!s || !s.length)
      return;

    var tokens;
    var length = s.length;
    var startIndex = 0, lastIndex = 0, endIndex = 0;
    while (lastIndex < length) {
      startIndex = s.indexOf('{{', lastIndex);
      endIndex = startIndex < 0 ? -1 : s.indexOf('}}', startIndex + 2);

      if (endIndex < 0) {
        if (!tokens)
          return;

        tokens.push(s.slice(lastIndex)); // TEXT
        break;
      }

      tokens = tokens || [];
      tokens.push(s.slice(lastIndex, startIndex)); // TEXT
      var pathString = s.slice(startIndex + 2, endIndex).trim();
      tokens.push(Path.get(pathString)); // PATH
      var delegateFn = prepareBindingFn &&
                       prepareBindingFn(pathString, name, node)
      tokens.push(delegateFn); // DELEGATE_FN
      lastIndex = endIndex + 2;
    }

    if (lastIndex === length)
      tokens.push(''); // TEXT

    tokens.hasOnePath = tokens.length === 4;
    tokens.isSimplePath = tokens.hasOnePath &&
                          tokens[0] == '' &&
                          tokens[3] == '';

    tokens.combinator = function(values) {
      var newValue = tokens[0];

      for (var i = 1; i < tokens.length; i += 3) {
        var value = tokens.hasOnePath ? values : values[(i - 1) / 3];
        if (value !== undefined)
          newValue += value;
        newValue += tokens[i + 2];
      }

      return newValue;
    }

    return tokens;
  };

  function processSinglePathBinding(name, tokens, node, model) {
    var delegateFn = tokens[2];
    var delegateValue = delegateFn && delegateFn(model, node);
    if (Observer.isObservable(delegateValue))
      return delegateValue;

    var observer = new PathObserver(model, tokens[1]);
    return tokens.isSimplePath ? observer :
        new ObserverTransform(observer, tokens.combinator);
  }

  function processBinding(name, tokens, node, model) {
    var observer = new CompoundObserver();

    for (var i = 1; i < tokens.length; i += 3) {
      var delegateFn = tokens[i + 1];
      var delegateValue = delegateFn && delegateFn(model, node);

      if (Observer.isObservable(delegateValue)) {
        observer.addObserver(delegateValue);
      } else {
        observer.addPath(model, tokens[i]);
      }
    }

    return new ObserverTransform(observer, tokens.combinator);
  }

  function processBindings(bindings, node, model, instanceBindings) {
    for (var i = 0; i < bindings.length; i += 2) {
      var name = bindings[i]
      var tokens = bindings[i + 1];
      var observer = tokens.hasOnePath ?
          processSinglePathBinding(name, tokens, node, model) :
          processBinding(name, tokens, node, model);

      var binding = node.bind(name, observer);
      if (instanceBindings)
        instanceBindings.push(binding);
    }
  }

  function parseAttributeBindings(element, prepareBindingFn) {
    assert(element);

    var bindings;
    var isTemplateNode = isTemplate(element);
    var ifFound = false;
    var bindFound = false;

    for (var i = 0; i < element.attributes.length; i++) {
      var attr = element.attributes[i];
      var name = attr.name;
      var value = attr.value;

      // Allow bindings expressed in attributes to be prefixed with underbars.
      // We do this to allow correct semantics for browsers that don't implement
      // <template> where certain attributes might trigger side-effects -- and
      // for IE which sanitizes certain attributes, disallowing mustache
      // replacements in their text.
      while (name[0] === '_') {
        name = name.substring(1);
      }

      if (isTemplateNode) {
        if (name === IF) {
          ifFound = true;
          value = value || '{{}}';  // Accept 'naked' if.
        } else if (name === BIND || name === REPEAT) {
          bindFound = true;
          value = value || '{{}}';  // Accept 'naked' bind & repeat.
        }
      }

      var tokens = parseMustaches(value, name, element,
                                  prepareBindingFn);
      if (!tokens)
        continue;

      bindings = bindings || [];
      bindings.push(name, tokens);
    }

    // Treat <template if> as <template bind if>
    if (ifFound && !bindFound) {
      bindings = bindings || [];
      bindings.push(BIND, parseMustaches('{{}}', BIND, element,
                                         prepareBindingFn));
    }

    return bindings;
  }

  function getBindings(node, prepareBindingFn) {
    if (node.nodeType === Node.ELEMENT_NODE)
      return parseAttributeBindings(node, prepareBindingFn);

    if (node.nodeType === Node.TEXT_NODE) {
      var tokens = parseMustaches(node.data, 'textContent', node,
                                  prepareBindingFn);
      if (tokens)
        return ['textContent', tokens];
    }
  }

  function addMapBindings(node, bindings, model, delegate, instanceBindings) {
    if (!bindings)
      return;

    if (bindings.templateRef) {
      HTMLTemplateElement.decorate(node, bindings.templateRef);
      if (delegate) {
        node.setBindingDelegate_(delegate);
      }
    }

    if (bindings.length)
      processBindings(bindings, node, model, instanceBindings);

    if (!bindings.children)
      return;

    var i = 0;
    for (var child = node.firstChild; child; child = child.nextSibling) {
      addMapBindings(child, bindings.children[i++], model, delegate,
                     instanceBindings);
    }
  }

  function addBindings(node, model, prepareBindingFn) {
    assert(node);

    var bindings = getBindings(node, prepareBindingFn);
    if (bindings)
      processBindings(bindings, node, model);

    for (var child = node.firstChild; child ; child = child.nextSibling)
      addBindings(child, model, prepareBindingFn);
  }

  function deepCloneIgnoreTemplateContent(node, stagingDocument) {
    var clone = stagingDocument.importNode(node, false);
    if (node.isTemplate_) {
      return clone;
    }

    for (var child = node.firstChild; child; child = child.nextSibling) {
      clone.appendChild(deepCloneIgnoreTemplateContent(child, stagingDocument))
    }

    return clone;
  }

  function createInstanceBindingMap(node, prepareBindingFn) {
    var map = getBindings(node, prepareBindingFn);
    if (isTemplate(node)) {
      node.isTemplate_ = true;
      map = map || [];
      map.templateRef = node;
    }

    var child = node.firstChild, index = 0;
    for (; child; child = child.nextSibling, index++) {
      var childMap = createInstanceBindingMap(child, prepareBindingFn);
      if (!childMap)
        continue;

      map = map || [];
      map.children = map.children || {};
      map.children[index] = childMap;
    }

    return map;
  }

  function TemplateInstance(firstNode, lastNode, model) {
    // TODO(rafaelw): firstNode & lastNode should be read-synchronous
    // in cases where script has modified the template instance boundary.
    // All should be read-only.
    this.firstNode = firstNode;
    this.lastNode = lastNode;
    this.model = model;
  }

  function addTemplateInstanceRecord(fragment, model) {
    if (!fragment.firstChild)
      return;

    var instanceRecord = new TemplateInstance(fragment.firstChild,
                                              fragment.lastChild, model);
    var node = instanceRecord.firstNode;
    while (node) {
      node.templateInstance_ = instanceRecord;
      node = node.nextSibling;
    }
  }

  Object.defineProperty(Node.prototype, 'templateInstance', {
    get: function() {
      var instance = this.templateInstance_;
      return instance ? instance :
          (this.parentNode ? this.parentNode.templateInstance : undefined);
    }
  });

  function TemplateIterator(templateElement) {
    this.closed = false;
    this.templateElement_ = templateElement;

    // Flattened array of tuples:
    //   <instanceTerminatorNode, [bindingsSetupByInstance]>
    this.terminators = [];

    this.iteratedValue = undefined;
    this.arrayObserver = undefined;

    this.repeatObserver = undefined;
    this.bindObserver = undefined;
    this.ifObserver = undefined;
  }

  TemplateIterator.prototype = {
    depsChanged: function() {
      ensureScheduled(this);
    },

    // Called as a result ensureScheduled (above).
    resolve: function() {
      if (this.ifObserver) {
        var ifValue = this.ifObserver.reset();
        if (!ifValue) {
          this.valueChanged(); // remove any instances
          return;
        }
      }

      var iterateValue;
      if (this.repeatObserver)
        iterateValue = this.repeatObserver.reset();
      else if (this.bindObserver)
        iterateValue = [this.bindObserver.reset()];

      return this.valueChanged(iterateValue);
    },

    valueChanged: function(value) {
      if (!Array.isArray(value))
        value = undefined;

      var oldValue = this.iteratedValue;
      this.unobserve();
      this.iteratedValue = value;

      if (this.iteratedValue) {
        this.arrayObserver = new ArrayObserver(this.iteratedValue);
        this.arrayObserver.open(this.handleSplices, this);
      }

      var splices = ArrayObserver.calculateSplices(this.iteratedValue || [],
                                                   oldValue || []);

      if (splices.length)
        this.handleSplices(splices);
    },

    getTerminatorAt: function(index) {
      if (index == -1)
        return this.templateElement_;
      var terminator = this.terminators[index*2];
      if (terminator.nodeType !== Node.ELEMENT_NODE ||
          this.templateElement_ === terminator) {
        return terminator;
      }

      var subIterator = terminator.iterator_;
      if (!subIterator)
        return terminator;

      return subIterator.getTerminatorAt(subIterator.terminators.length/2 - 1);
    },

    // TODO(rafaelw): If we inserting sequences of instances we can probably
    // avoid lots of calls to getTerminatorAt(), or cache its result.
    insertInstanceAt: function(index, fragment, instanceNodes,
                               instanceBindings) {
      var previousTerminator = this.getTerminatorAt(index - 1);
      var terminator = previousTerminator;
      if (fragment)
        terminator = fragment.lastChild || terminator;
      else if (instanceNodes)
        terminator = instanceNodes[instanceNodes.length - 1] || terminator;

      this.terminators.splice(index*2, 0, terminator, instanceBindings);
      var parent = this.templateElement_.parentNode;
      var insertBeforeNode = previousTerminator.nextSibling;

      if (fragment) {
        parent.insertBefore(fragment, insertBeforeNode);
      } else if (instanceNodes) {
        for (var i = 0; i < instanceNodes.length; i++)
          parent.insertBefore(instanceNodes[i], insertBeforeNode);
      }
    },

    extractInstanceAt: function(index) {
      var instanceNodes = [];
      var previousTerminator = this.getTerminatorAt(index - 1);
      var terminator = this.getTerminatorAt(index);
      instanceNodes.instanceBindings = this.terminators[index*2 + 1];
      this.terminators.splice(index*2, 2);

      var parent = this.templateElement_.parentNode;
      while (terminator !== previousTerminator) {
        var node = previousTerminator.nextSibling;
        if (node == terminator)
          terminator = previousTerminator;

        parent.removeChild(node);
        instanceNodes.push(node);
      }

      return instanceNodes;
    },

    getDelegateFn: function(fn) {
      fn = fn && fn(this.templateElement_);
      return typeof fn === 'function' ? fn : null;
    },

    handleSplices: function(splices) {
      if (this.closed)
        return;

      var template = this.templateElement_;

      if (!template.parentNode || !template.ownerDocument.defaultView) {
        this.close();
        return;
      }

      if (this.instanceModelFn_ === undefined) {
        this.instanceModelFn_ =
            this.getDelegateFn(template.prepareInstanceModelFn_);
      }

      if (this.instancePositionChangedFn_ === undefined) {
        this.instancePositionChangedFn_ =
            this.getDelegateFn(template.prepareInstancePositionChangedFn_);
      }

      var instanceCache = new Map;
      var removeDelta = 0;
      splices.forEach(function(splice) {
        splice.removed.forEach(function(model) {
          var instanceNodes =
              this.extractInstanceAt(splice.index + removeDelta);
          instanceCache.set(model, instanceNodes);
        }, this);

        removeDelta -= splice.addedCount;
      }, this);

      splices.forEach(function(splice) {
        var addIndex = splice.index;
        for (; addIndex < splice.index + splice.addedCount; addIndex++) {
          var model = this.iteratedValue[addIndex];
          var fragment = undefined;
          var instanceNodes = instanceCache.get(model);
          var instanceBindings;
          if (instanceNodes) {
            instanceCache.delete(model);
            instanceBindings = instanceNodes.instanceBindings;
          } else {
            instanceBindings = [];
            if (this.instanceModelFn_)
              model = this.instanceModelFn_(model);

            if (model !== undefined) {
              fragment = this.templateElement_.createInstance(model,
                                                              instanceBindings);
            }
          }

          this.insertInstanceAt(addIndex, fragment, instanceNodes,
                                instanceBindings);
        }
      }, this);

      instanceCache.forEach(function(instanceNodes) {
        this.closeInstanceBindings(instanceNodes.instanceBindings);
      }, this);

      if (this.instancePositionChangedFn_)
        this.reportInstancesMoved(splices);
    },

    reportInstanceMoved: function(index) {
      var previousTerminator = this.getTerminatorAt(index - 1);
      var terminator = this.getTerminatorAt(index);
      if (previousTerminator === terminator)
        return; // instance has zero nodes.

      // We must use the first node of the instance, because any subsequent
      // nodes may have been generated by sub-templates.
      // TODO(rafaelw): This is brittle WRT instance mutation -- e.g. if the
      // first node was removed by script.
      var templateInstance = previousTerminator.nextSibling.templateInstance;
      this.instancePositionChangedFn_(templateInstance, index);
    },

    reportInstancesMoved: function(splices) {
      var index = 0;
      var offset = 0;
      for (var i = 0; i < splices.length; i++) {
        var splice = splices[i];
        if (offset != 0) {
          while (index < splice.index) {
            this.reportInstanceMoved(index);
            index++;
          }
        } else {
          index = splice.index;
        }

        while (index < splice.index + splice.addedCount) {
          this.reportInstanceMoved(index);
          index++;
        }

        offset += splice.addedCount - splice.removed.length;
      }

      if (offset == 0)
        return;

      var length = this.terminators.length / 2;
      while (index < length) {
        this.reportInstanceMoved(index);
        index++;
      }
    },

    closeInstanceBindings: function(instanceBindings) {
      for (var i = 0; i < instanceBindings.length; i++) {
        instanceBindings[i].close();
      }
    },

    unobserve: function() {
      if (!this.arrayObserver)
        return;

      this.arrayObserver.close();
      this.arrayObserver = undefined;
    },

    close: function() {
      if (this.closed)
        return;
      this.unobserve();
      for (var i = 1; i < this.terminators.length; i += 2) {
        this.closeInstanceBindings(this.terminators[i]);
      }

      this.terminators.length = 0;
      if (this.bindObserver)
        this.bindObserver.close();
      this.bindObserver = undefined;
      if (this.repeatObserver)
        this.repeatObserver.close();
      this.repeatObserver = undefined;
      if (this.ifObserver)
        this.ifObserver.close();
      this.ifObserver = undefined;

      this.templateElement_.iterator_ = undefined;
      this.closed = true;
    }
  };

  // Polyfill-specific API.
  HTMLTemplateElement.forAllTemplatesFrom_ = forAllTemplatesFrom;
})(this);
