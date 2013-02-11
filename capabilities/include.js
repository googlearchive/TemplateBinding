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

document.write('<link rel="stylesheet" href="../template_element.css">');
[
  '../src/compat.js',
  '../src/side_table.js',
  '../third_party/ChangeSummary/change_summary.js',
  '../src/model.js',
  '../src/script_value_binding.js',
  '../src/text_replacements_binding.js',
  '../src/element_attribute_bindings.js',
  '../src/element_bindings.js',
  '../src/input_bindings.js',
  '../src/template_element.js',
  '../src/delegates.js',
].forEach(function(src) {
  document.write('<script src="' + src + '"></script>');
});
