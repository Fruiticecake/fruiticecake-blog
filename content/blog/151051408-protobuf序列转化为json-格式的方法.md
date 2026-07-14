---
title: Protobuf序列转化为json 格式的方法
date: 2025-08-31
summary: 需要如下文件 example.proto testdata.txt — 待转化的二进制数据 安装protoc Releases · protocolbuffers/protobuf · GitHub…
tags: [CSDN同步, 数据库, python]
slug: 151051408-protobuf序列转化为json-格式的方法
source: https://blog.csdn.net/weixin_52400878/article/details/151051408
---

需要如下文件

example.proto

testdata.txt —- 待转化的二进制数据

### 安装protoc

Releases · protocolbuffers/protobuf · GitHub

下载后 将bin文件添加到系统PATH中。—- 版本上protoc和安装的python的protobuff大版本要对应。

protoc --python_out=. example.proto

执行成功后会生成一个py脚本 — example_pb2.py

将下方的import 库 修改为生成的脚本。

### 运行python脚本

```
import json
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

    with
```

> 原载 [CSDN](https://blog.csdn.net/weixin_52400878/article/details/151051408)，同步至本站。
