---
title: "Protobuf序列转化为json 格式的方法"
date: 2025-08-31
summary: "文章摘要：本文介绍了Protocol Buffers数据转换的步骤。首先需要下载protoc编译器并配置PATH环境变量，确保python的protobuf版本与之匹配。通过protoc命令生成_pb2.py脚本后，使用Python代码将二"
tags: ["CSDN同步", "数据库", "json", "python", "linux", "iot", "prototype"]
slug: 151051408-protobuf序列转化为json-格式的方法
source: "https://blog.csdn.net/weixin_52400878/article/details/151051408"
html: true
---

<p>需要如下文件</p>

<p>example.proto</p>

<p>testdata.txt &mdash;- 待转化的二进制数据</p>

<p><!-- notionvc: 8a55549f-0077-41e2-b141-fca7c28fe1c1 --></p>

<h2>安装protoc</h2>

<p><a data-link-desc="Protocol Buffers - Google's data interchange format - Releases · protocolbuffers/protobuf" data-link-icon="https://csdnimg.cn/release/blog_editor_html/release2.4.2/ckeditor/plugins/CsdnLink/icons/icon-default.png?t=P7R7" data-link-title="Releases · protocolbuffers/protobuf · GitHub" href="https://github.com/protocolbuffers/protobuf/releases" title="Releases · protocolbuffers/protobuf · GitHub">Releases &middot; protocolbuffers/protobuf &middot; GitHub</a></p>

<p>下载后 将bin文件添加到系统PATH中。&mdash;- 版本上protoc和安装的python的protobuff大版本要对应。</p>

<p>protoc --python_out=. example.proto</p>

<p>执行成功后会生成一个py脚本&nbsp; &nbsp;&mdash; example_pb2.py</p>

<p>将下方的import 库 修改为生成的脚本。</p>

<h2>运行python脚本</h2>

<pre>
<code class="language-python">import json
from google.protobuf import json_format
from example_pb2 import Config    //替换为生成的py脚本

def protobuf_bin_to_json(input_file, output_file):
    with open(input_file, 'rb') as f:
        protobuf_data = f.read()

    proto_message = Config()
    proto_message.ParseFromString(protobuf_data)

    json_dict = json_format.MessageToDict(
        proto_message,
        always_print_fields_with_no_presence=True,
        preserving_proto_field_name=True
    )

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(json_dict, f, indent=2, ensure_ascii=False)

    print(f"转换完成！结果已保存到 {output_file}")
    return json_dict

if __name__ == "__main__":
    input_file = "testdata.txt"
    output_file = "output.json"
    result = protobuf_bin_to_json(input_file, output_file)

</code></pre>

<p><!-- notionvc: a016ecf7-0c85-4688-908c-1b41b597aa5e --></p>
<p class="source-note">原文发布于 <a href="https://blog.csdn.net/weixin_52400878/article/details/151051408" target="_blank" rel="noopener noreferrer">CSDN</a>。</p>
