// Copyright 2013 Google Inc.
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

var TextReplacementsBinding;

(function() {
  'use strict';

  var placeHolderParser = new PlaceHolderParser;

  var OneWay = DelegatedValueBinding.Type.OneWay;

  function assert(v) {
    if (!v)
      throw new Error('Assertion failed');
  }

  TextReplacementsBinding = function(model, delegate, bindingText, observer) {
    this.observer_ = observer;
    this.value_ = '';
    this.bindingText_ = bindingText;
    this.bindings_ = [];
    this.tokens_ = this.parsePlaceHolders(bindingText);
    this.bindPlaceHolders(model, delegate);
    this.computeValue();
  };

  TextReplacementsBinding.prototype = {
    get value() {
      return this.value_;
    },

    valueIsSimpleNull: function() {
      return this.tokens_.length === 1 && this.bindings_.length === 1 &&
          this.bindings_[0].value === null;
    },

    setModel: function(model) {
      var changed = false;
      for (var i = 0; i < this.bindings_.length; i++) {
        changed = this.bindings_[i].setModel(model) || changed;
      }

      if (changed)
        return this.computeValue();

      return false;
    },

    setDelegate: function(model, delegate) {
      var changed = false;
      for (var i = 0; i < this.bindings_.length; i++) {
        changed = this.bindings_[i].setDelegate(model, delegate) || changed;
      }

      if (changed)
        this.computeValue();

      return changed;
    },

    get bindingText() {
      return this.bindingText_;
    },

    valueChanged: function(binding){
      if (this.computeValue())
        this.observer_.valueChanged(this);
    },

    computeValue: function() {
      var newValue = '';
      var tokens = this.tokens_;
      var bindings = this.bindings_;
      var value;

      var bindingIndex = 0;
      for (var i = 0; i < this.tokens_.length; i++) {
        var token = tokens[i];
        if (token.type === 'text') {
          newValue += token.value;
        } else {
          // We do not support 'expr' any more.
          assert(token.type === 'dep');
          assert(bindingIndex < this.bindings_.length);
          value = bindings[bindingIndex++].value;
          if (value !== undefined)
            newValue += value;
        }
      }

      if (newValue !== this.value_) {
        this.value_ = newValue;
        return true;
      }

      return false;
    },

    parsePlaceHolders: function(input) {
      // TODO(arv): The old place holder parser represents the placeholders as
      //
      // {
      //   path: string,
      //   transformName: string,
      //   transformArgs: Array
      // }
      //
      // We only need the path since transformers are being removed in favor of
      // model delegates.
      var tokens = placeHolderParser.parse(input);
      return tokens.map(function(token) {
        if (token.type === 'dep')
          token.value = token.value.path;
        else
          assert(token.type === 'text');
        return token;
      });
    },

    bindPlaceHolders: function(model, delegate) {
      for (var i = 0; i < this.tokens_.length; i++) {
        if (this.tokens_[i].type === 'dep') {
          this.bindings_.push(
              new DelegatedValueBinding(model, delegate, this.tokens_[i].value,
                                        OneWay, this));
        }
      }
    }
  };

})();