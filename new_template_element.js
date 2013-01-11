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

  function isObject(value) {
    return Object(value) === value;
  }

  function toUint32(v) {
    return v >>> 0;
  }

  var forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach);

  var templateAttributeDirectives = {
    'template': true,
    'iterate': true,
    'instantiate': true,
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
    'OPTION': true
  };

  var allTemplatesSelectors = 'template, ' +
      Object.keys(semanticTemplateElements).map(function(tagName) {
        return tagName.toLowerCase() + '[template]';
      }).join(', ');

  function getTemplateDescendentsOf(node) {
    return node.querySelectorAll(allTemplatesSelectors);
  }

  function isAttributeTemplate(el) {
    return semanticTemplateElements[el.tagName] &&
        el.hasAttribute('template');
  }

  function isTemplateElement(el) {
    return el.tagName == 'TEMPLATE' || isAttributeTemplate(el);
  }

  // FIXME: Observe templates being added/removed from documents
  // FIXME: Expose imperative API to decorate and observe templates in
  // "disconnected tress" (e.g. ShadowRoot)
  document.addEventListener('DOMContentLoaded', function(e) {
    var templates = getTemplateDescendentsOf(document);
    forEach(templates, HTMLTemplateElement.decorate);
  }, false);

  var hasTemplateElement = typeof HTMLTemplateElement !== 'undefined';

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

  var templateContentsTable = new SideTable('templateContents');
  var templateContentsOwnerTable = new SideTable('templateContentsOwner');
  var reverseTemplateContentsOwnerTable =
      new SideTable('reverseTemplateContentsOwner');

  // http://dvcs.w3.org/hg/webcomponents/raw-file/tip/spec/templates/index.html#dfn-template-contents-owner
  function getTemplateContentsOwner(doc) {
    if (!doc.defaultView)
      return doc;
    var d = templateContentsOwnerTable.get(doc);
    if (!d) {
      // TODO(arv): This should either be a Document or HTMLDocument depending
      // on doc.
      d = doc.implementation.createHTMLDocument('');
      while (d.lastChild) {
        d.removeChild(d.lastChild);
      }
      templateContentsOwnerTable.set(doc, d);
    }
    return d;
  }

  function cloneAndSeperateAttributeTemplate(templateElement) {
    var clone = templateElement.cloneNode(false);
    var attribs = templateElement.attributes;
    var count = attribs.length;
    while (count-- > 0) {
      var attrib = attribs[count];
      if (templateAttributeDirectives[attrib.name])
        clone.removeAttribute(attrib.name);
      else
        templateElement.removeAttribute(attrib.name);
    }

    return clone;
  }

  function moveTemplateContentIntoContent(templateElement) {
    var doc = getTemplateContentsOwner(templateElement.ownerDocument);
    var df = doc.createDocumentFragment();
    if (isAttributeTemplate(templateElement)) {
      // For attribute templates we copy the whole thing into the content and
      // we move the non template attributes into the content.
      //
      //   <tr foo template>
      //
      // becomes
      //
      //   <tr template>
      //   + #document-fragment
      //     + <tr foo>
      //
      var newRoot = cloneAndSeperateAttributeTemplate(templateElement);
      var child;
      while (child = templateElement.firstChild) {
        newRoot.appendChild(child);
      }
      df.appendChild(newRoot);
    } else {
      var child;
      while (child = templateElement.firstChild) {
        df.appendChild(child);
      }
    }
    templateContentsTable.set(templateElement, df);

    forEach(getTemplateDescendentsOf(df), HTMLTemplateElement.decorate);
  }

  /**
   * Similar to |templateElement.content| but it also works on attribute
   * templates.
   */
  function getTemplateContent(templateElement) {
    if (!hasTemplateElement || isAttributeTemplate(templateElement))
      return templateContentsTable.get(templateElement);
    return templateElement.content;
  }

  HTMLTemplateElement.decorate = function(el) {
    if (el.templateIsDecorated_)
      return;
    fixTemplateElementPrototype(el);
    decorateTemplateElement(el, true);
  };

  var htmlElement = global.HTMLUnknownElement || HTMLElement;

  if (!hasTemplateElement) {
    // Gecko is more picky with the prototype than WebKit. Make sure to use the
    // same prototype as created in the constructor.
    HTMLTemplateElement.prototype = Object.create(htmlElement.prototype);

    Object.defineProperty(HTMLTemplateElement.prototype, 'content', {
      get: function() {
        return templateContentsTable.get(this);
      },
      enumerable: true,
      configurable: true
    });
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
    }
  }

  function decorateTemplateElement(el, shouldMoveContent) {
      el.templateIsDecorated_ = true;

      if (shouldMoveContent && (!hasTemplateElement || isAttributeTemplate(el)))
        moveTemplateContentIntoContent(el);

      // Associate the inner document with the outer.
      // This is needed to be able to find ref templates from the inner document
      // to the outer document.
      var outerDocument = el.ownerDocument;
      var innerDocument = getTemplateContent(el).ownerDocument;
      if (innerDocument !== outerDocument)
        reverseTemplateContentsOwnerTable.set(innerDocument, outerDocument);

      Model.enqueue(el.checkIteration.bind(el));
  }

  mixin(HTMLTemplateElement.prototype, {

    get instantiate() {
      return this.getAttribute('instantiate');
    },

    set instantiate(instantiate) {
      var oldVal = this.instantiate;
      if (instantiate == null)
        this.removeAttribute('instantiate');
      else
        this.setAttribute('instantiate', instantiate);
      if (instantiate != oldVal) {
        this.removeAttribute('iterate');
        Model.enqueue(this.checkIteration.bind(this));
      }
    },

    get iterate() {
      return this.getAttribute('iterate');
    },

    set iterate(iterate) {
      var oldVal = this.iterate;
      if (iterate == null)
        this.removeAttribute('iterate');
      else
        this.setAttribute('iterate', iterate);
      if (iterate != oldVal) {
        this.removeAttribute('instantiate');
        Model.enqueue(this.checkIteration.bind(this));
      }
    },

    get ref() {
      var ref = this.getAttribute('ref');
      if (!ref)
        return null;

      // If this template element is inside another template element we need to
      // also check the owner document of the outer template.
      var doc = this.ownerDocument;
      var refTemplate = doc.getElementById(ref);
      if (refTemplate)
        return refTemplate;

      doc = reverseTemplateContentsOwnerTable.get(doc);
      if (!doc)
        return null;

      return doc.getElementById(ref) || null;
    }
  });

  function parseSinglePathFromPlaceholder(input, startIndex) {
    assert(input.indexOf("{{") >= 0);
    assert(input.indexOf("}}") >= 0);
    var indexAfterBraces = startIndex + 2;
    var endIndex = input.indexOf("}}", indexAfterBraces);
    return input.slice(indexAfterBraces, endIndex).trim();
  }

  function isCheckBoxOrRadioButton(element) {
    return element.type === 'radio' || element.type === 'checkbox';
  }

  function addElementBindings(element) {
    assert(element);
    if (!element.hasAttributes())
      return;

    for (var i = 0; i < element.attributes.length; i++) {
      var attr = element.attributes[i];
      var index = attr.value.indexOf('{{');
      if (index !== -1 && attr.value.indexOf('}}', index) !== -1) {
        if (element.tagName === 'INPUT') {
          if (attr.name == 'value') {
            var value = attr.value;
            element.removeAttribute('value');
            element.addValueBinding(
                parseSinglePathFromPlaceholder(value, index));
          } else if (attr.name == 'checked' &&
                     isCheckBoxOrRadioButton(element)) {
            var value = attr.value;
            element.removeAttribute('checked');
            element.addCheckedBinding(
                parseSinglePathFromPlaceholder(value, index));
          } else {
            element.addBinding(attr.name, attr.value);
          }
        } else {
          element.addBinding(attr.name, attr.value);
        }
      }
    }
  }

  function addTextNodeBinding(text) {
    assert(text);
    var index = text.data.indexOf('{{');
    if (index !== -1 && text.data.indexOf('}}', index + 2))
      text.addBinding(text.data);
  }

  function addBindings(node, prototype) {
    assert(node);

    if (node.nodeType === Node.ELEMENT_NODE)
      addElementBindings(node);
    else if (node.nodeType === Node.TEXT_NODE)
      addTextNodeBinding(node);

    var child = node.firstChild;
    var protoChild = prototype.firstChild;
    for ( ; child && protoChild;
         child = child.nextSibling, protoChild = protoChild.nextSibling) {
      addBindings(child, protoChild);
    }

    assert(child && protoChild || !child && !protoChild);
  }

  function setModelAndDelegateOnChildren(node, model, modelDelegate) {
    for (var child = node.firstChild; child; child = child.nextSibling) {
      child.model = model;
      child.modelDelegate = modelDelegate;
    }
  }

  function ArrayTracker(value, observer) {
    this.object_ = value;
    this.observer_ = observer;
    assert(isObject(this.object_));
    assert(this.observer_);

    this.boundScriptPropertyChanged_ = this.scriptPropertyChanged.bind(this);
    Model.observePropertySet(value, this.boundScriptPropertyChanged_);
  }

  ArrayTracker.prototype = {
    unbind: function() {
      Model.stopObservingPropertySet(value, this.boundScriptPropertyChanged_);
    },

    scriptPropertyChanged: function(record) {
      assert(record.mutation === 'splice');
      if (record.added.length !== record.removed.length)
        this.observer_.lengthChanged(this.object_.length);
    }
  };

  function cloneNodeAndContent(node) {
    var clone = node.cloneNode(false);  // Shallow clone.
    if (isTemplateElement(clone)) {
      var df = cloneNodeAndContent(node.content);
      templateContentsTable.set(clone, df);
      fixTemplateElementPrototype(clone);
      decorateTemplateElement(clone, false);
    }
    for (var child = node.firstChild; child; child = child.nextSibling) {
      clone.appendChild(cloneNodeAndContent(child))
    }
    return clone;
  }

  function cloneTemplateContent(df) {
    if (!hasTemplateElement)
      return cloneNodeAndContent(df);

    function initializeTemplates(node) {
      forEach(getTemplateDescendentsOf(node), function(node) {
        HTMLTemplateElement.decorate(node);
        initializeTemplates(node.content);
      });
    }

    var clone = df.cloneNode(true);
    initializeTemplates(clone);
    return clone;
  }

  function removeChild(parent, child) {
    if (isTemplateElement(child)) {
      // Make sure we stop observing when we remove an element.
      var templateIterator = templateIteratorTable.get(child);
      if (templateIterator) {
        templateIterator.unbind();
        templateIteratorTable.delete(child);
      }
    }
    parent.removeChild(child);
  }

  function InstanceCursor(templateElement) {
    this.template_ = templateElement;
    this.previousTerminator_ = null;
    this.previousIndex_ = -1;
    this.terminator_ = templateElement;
    this.index_ = 0;
  }

  InstanceCursor.prototype = {
    next: function() {
      this.previousTerminator_ = this.terminator_;
      this.previousIndex_ = this.index_;
      this.index_++;

      while (this.index_ > instanceTerminatorCount(this.terminator_)) {
        this.index_ -= instanceTerminatorCount(this.terminator_);
        this.terminator_ = this.terminator_.nextSibling;
        if (this.terminator_.tagName === 'TEMPLATE')
          this.index_ += this.terminator_.instanceCount();
      }
    },

    abandon: function() {
      assert(this.template_.instanceCount());
      assert(instanceTerminatorCount(this.terminator_));
      assert(this.index_);

      decrementInstanceTerminatorCount(this.terminator_);
      this.index_--;
    },

    insert: function(model) {
      assert(this.template_.parentNode);

      this.previousTerminator_ = this.terminator_;
      this.previousIndex_ = this.index_;
      this.index_++;

      var content = null;
      var ref = this.template_.ref;
      if (ref)
        content = ref.content;
      if (!content)
        content = this.template_.content;
      var instance = cloneTemplateContent(content);

      setModelAndDelegateOnChildren(instance, model,
                                    this.template_.parentNode.modelDelegate);
      addBindings(instance, content);

      this.terminator_ = instance.lastChild || this.previousTerminator_;
      this.template_.parentNode.insertBefore(instance,
          this.previousTerminator_.nextSibling);

      incrementInstanceTerminatorCount(this.terminator_);
      if (this.terminator_ !== this.previousTerminator_) {
        while (instanceTerminatorCount(this.previousTerminator_) >
                this.previousIndex_) {
          decrementInstanceTerminatorCount(this.previousTerminator_);
          incrementInstanceTerminatorCount(this.terminator_);
        }
      }
    },

    remove: function() {
      assert(this.previousIndex_ !== -1);
      assert(this.previousTerminator_ &&
             (this.previousIndex_ > 0 ||
              this.previousTerminator_ === this.template_));
      assert(this.terminator_ && this.index_ > 0);
      assert(this.template_.parentNode);
      assert(this.template_.instanceCount());

      if (this.previousTerminator_ === this.terminator_) {
        assert(this.index_ == this.previousIndex_ + 1);
        decrementInstanceTerminatorCount(this.terminator_);
        this.terminator_ = this.template_;
        this.previousTerminator_ = null;
        this.previousIndex_ = -1;
        return;
      }

      decrementInstanceTerminatorCount(this.terminator_);

      var parent = this.template_.parentNode;
      while (this.previousTerminator_.nextSibling !== this.terminator_) {
        removeChild(parent, this.previousTerminator_.nextSibling);
      }
      removeChild(parent, this.terminator_);

      this.terminator_ = this.previousTerminator_;
      this.index_ = this.previousIndex_;
      this.previousTerminator_ = null;
      this.previousIndex_ = -1;  // 0?
    }
  };

  function TemplateInstance(templateElement, model, path, index) {
    this.template_ = templateElement;
    this.index_ = index;
    this.active_ = false;
    this.binding_ = new ScriptValueBinding(model, path, this);

    this.valueChanged(this.binding_);
  }

  TemplateInstance.prototype = {
    unbind: function() {
      this.binding_.unbind();
    },

    valueChanged: function(binding) {
      var value = binding.value;
      var cursor = new InstanceCursor(this.template_);
      var advanced = false;
      if (this.active_) {
        for (var i = 0; i <= this.index_; i++) {
          cursor.next();
        }
        cursor.remove();
        this.active_ = false;
        advanced = true;
      }

      if (!advanced) {
        for (var i = 0; i < this.index_; i++) {
          cursor.next();
        }
      }
      cursor.insert(value);
      this.active_ = true;
    },

    get isActive() {
      return this.active_;
    }
  };

  var ONE_WAY = DelegatedValueBinding.Type.ONE_WAY;

  function TemplateIterator(templateElement, bindingText, isIterate) {
    this.templateElement_ = templateElement;
    this.binding_ = new DelegatedValueBinding(templateElement.model,
                                              templateElement.modelDelegate,
                                              bindingText, ONE_WAY, this);
    this.bindingText_ = bindingText;
    this.isIterate_ = isIterate;
    this.instances_ = [];
    this.arrayTracker_ = null;

    this.valueChanged(this.binding_);
  }

  TemplateIterator.prototype = {
    get bindingText() {
      return this.bindingText_;
    },

    get isIterate() {
      return this.isIterate_;
    },

    unbind: function() {
      this.instances_.forEach(function(instance) {
        instance.unbind();
      });
    },

    valueChanged: function(binding) {
      this.clear();

      var value = this.binding_.value;
      if (value == null)
          return;

      if (!this.isIterate_) {
        this.instantiate();
        return;
      }

      if (!isObject(value))
        return;

      // undefined etc will result in 0.
      this.iterate(toUint32(value.length));
    },

    setModel: function(model) {
      if (this.binding_.setModel(model)) {
        this.valueChanged(this.binding_);
        return true;
      }

      return false;
    },

    setDelegate: function(model, delegate) {
      if (this.binding_.setDelegate(model, delegate)) {
        this.valueChanged(this.binding_);
        return true;
      }

      return false;
    },

    clear: function() {
      if (!this.instances_.length)
        return;
      var count = this.instanceCount();
      for (var i = 0; i < count; i++) {
        var cursor = new InstanceCursor(this.templateElement_);
        cursor.next();
        cursor.remove();
      }
      this.unbind();
      this.instances_ = [];
      this.arrayTracker_ = null;
    },

    instantiate: function() {
      this.instances_.push(new TemplateInstance(this.templateElement_,
                                                this.binding_.value, '', 0));
    },

    iterate: function(length) {
      if (length)
        this.lengthChanged(length);
      this.arrayTracker_ = new ArrayTracker(this.binding_.value, this);
    },

    instanceCount: function()  {
      var count = 0;
      for (var i = 0; i < this.instances_.length; i++) {
        if (this.instances_[i].isActive)
          count++;
      }
      return count;
    },

    // FIXME: Consider merging this code with clear(), e.g. clear(bool abandonInstances = false)
    abandonInstances: function() {
      assert(!this.instances_.length || this.instances_.length == 1);
      var cursor = new InstanceCursor(this.templateElement_);
      for (var i = 0; i < this.instances_.length; i++) {
        if (this.instances_[i].isActive) {
          cursor.next();
          cursor.abandon();
        }
      }
      this.unbind();
      this.instances_ = [];
      this.arrayTracker_ = null;
    },

    lengthChanged: function(newLength) {
      var currentSize = this.instances_.length;
      if (currentSize === newLength)
        return;

      if (newLength < currentSize) {
        // FIXME: InstanceCursor should be able to deal with multiple removals
        for (var i = currentSize; i > newLength; i--) {
          var cursor = new InstanceCursor(this.templateElement_);
          for (var j = 0; j < i; j++) {
            cursor.next();
          }
          cursor.remove();
          this.instances_[i - 1].unbind();
        }

        this.instances_.length = newLength;
        return;
      }

      for (var i = this.instances_.length; i < newLength; i++) {
        var indexedPath = String(i);
        this.instances_.push(new TemplateInstance(this.templateElement_,
                                                  this.binding_.value,
                                                  indexedPath, i));
      }
    }
  };

  var templateIteratorTable = new SideTable('templateIterator');

  // TODO(arv): These should not be public.
  mixin(HTMLTemplateElement.prototype, {
    instanceCount: function() {
      var templateIterator = templateIteratorTable.get(this);
      return templateIterator ? templateIterator.instanceCount() : 0;
    },

    abandonInstances: function() {
      var templateIterator = templateIteratorTable.get(this);
      if (!templateIterator)
        return;

      templateIterator.abandonInstances();
      templateIteratorTable.delete(this);
    },

    checkIteration: function() {
      var bindingText;
      var isIterate = false;
      if (this.parentNode && this.ownerDocument.defaultView) {
        bindingText = this.getAttribute('instantiate');
        if (bindingText === null) {
          isIterate = true;
          bindingText = this.getAttribute('iterate');
        }
      }

      var templateIterator = templateIteratorTable.get(this);
      if (templateIterator &&
          templateIterator.bindingText === this.bindingText &&
          templateIterator.isIterate === isIterate) {
        return;
      }

      if (templateIterator) {
        templateIterator.clear();
        templateIteratorTable.delete(this);
      }

      if (bindingText == null)
        return;

      templateIterator = new TemplateIterator(this, bindingText, isIterate);
      templateIteratorTable.set(this, templateIterator);
    },

    modelChanged: function() {
      Element.prototype.modelChanged.call(this);
      var templateIterator = templateIteratorTable.get(this);
      if (templateIterator)
        Model.enqueue(this.lazyModelChanged.bind(this));
    },

    lazyModelChanged: function() {
      var templateIterator = templateIteratorTable.get(this);
      if (templateIterator)
        templateIterator.setModel(this.model);
    },

    modelDelegateChanged: function() {
      Element.prototype.modelDelegateChanged.call(this);
      var templateIterator = templateIteratorTable.get(this);
      if (templateIterator)
        Model.enqueue(this.lazyModelDelegateChanged.bind(this));
    },

    lazyModelDelegateChanged: function() {
      var templateIterator = templateIteratorTable.get(this);
      if (templateIterator)
        templateIterator.setDelegate(this.model, this.modelDelegate);
    }
  });

  // TODO(arv): Consider storing all "NodeRareData" on a single object?
  function InstanceTerminatorCount() {
    this.instanceTerminatorCount_ = 0;
  }

  InstanceTerminatorCount.prototype = {
    instanceTerminatorCount: function() {
      return this.instanceTerminatorCount_;
    },
    incrementInstanceTerminatorCount: function() {
      this.instanceTerminatorCount_++;
    },
    decrementInstanceTerminatorCount: function() {
      this.instanceTerminatorCount_--;
    },
  };

  var instanceTerminatorCountTable = new SideTable('instanceTerminatorCount');

  function ensureInstanceTerminatorCount(node) {
    var count = instanceTerminatorCountTable.get(node);
    if (!count) {
      count = new InstanceTerminatorCount();
      instanceTerminatorCountTable.set(node, count);
    }
    return count;
  }

  function incrementInstanceTerminatorCount(node) {
    ensureInstanceTerminatorCount(node).incrementInstanceTerminatorCount();
  }

  function decrementInstanceTerminatorCount(node){
    ensureInstanceTerminatorCount(node).decrementInstanceTerminatorCount();
  }

  function instanceTerminatorCount(node) {
    var data = instanceTerminatorCountTable.get(node);
    return data ? data.instanceTerminatorCount() : 0;
  }

  // Expose for testing
  HTMLTemplateElement.allTemplatesSelectors = allTemplatesSelectors;

})(this);
