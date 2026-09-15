# 拾字成诗题库
来源：https://github.com/chinese-poetry/chinese-poetry
版本：b8594f81a89752241442f2ce267d6f66f96704ee
范围：唐诗和宋词（不含宋诗），包含至少一个完整五字或七字标点分句。
数量：1000 首，7119 个候选句。
排序：各有效搜索引擎结果数的 log(1+n) 均值，降序取 Top 1000；非正数、缺失值不计。并列按内容 ID 排序。
剔除标题过短、残缺及“句/又一首/又歌”等缺乏可辨识标题的记录。
先核对 rank 与原作作者、标题的对应关系，按作者和全文去重，使用 OpenCC t2s 转简体。
rank 为历史搜索结果量代理，非权威难度分级；宋词词牌查询可能对应多首作品。
运行 scripts/build-poetry.py SOURCE_DIR 1000 可重建。源数据 MIT 许可证见 poetry-LICENSE.txt。
