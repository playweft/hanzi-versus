# 成语词表

`idioms_top4500.txt` 是从 [THUOCL 成语词表](https://github.com/thunlp/THUOCL/blob/master/data/THUOCL_chengyu.txt) 中筛选出的前 4500 个四字词条。

文件按 THUOCL 原始顺序保存，即按 DF（Document Frequency，文档频率）从高到低排列。每行格式为：

```text
成语<TAB>DF频率
```

原始词表由清华大学自然语言处理与社会人文计算实验室发布，遵循其仓库中的开源协议。该数据仅适合作为游戏题库候选词，不代表每个词条都符合严格的现代汉语成语定义。
