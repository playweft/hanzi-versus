# 拾字成诗：熟悉诗句精选库
共 490 条作品分层记录（同一作品可有不同层的选句），2426 个候选句。
原文：https://github.com/chinese-poetry/chinese-poetry ，版本 b8594f81a89752241442f2ce267d6f66f96704ee。
分层：{"basic": {"poems": 82, "lines": 327}, "normal": {"poems": 100, "lines": 522}, "advanced": {"poems": 308, "lines": 1577}}。默认入门35%、普通55%、进阶10%，各层先抽作品再抽句子。
选篇：scripts/poetry-school.json 为课标篇目及逐句白名单，小学入门，初高中普通，个别生僻高中篇目进阶。课标共155项，非五七字篇目保留在清单但不出题。scripts/poetry-selection.txt 为课外选单，scripts/poetry-expansion.json 为《唐诗三百首》《千家诗》逐篇复核的扩展选单，scripts/poetry-restored.json 保存通行文本与核对网址。scripts/poetry-famous.json 为逐句复核的熟悉名句补充白名单，按单句放入入门或普通，不提升整篇。课标、名句补充、旧选单依次去重，旧选单剩余句仅供进阶。不是某一教材的完整篇目表，也不是对人群熟悉度的统计结论。
每条作品保留源文件、数组位置、原标题、匹配锚点与选句依据；不使用作者或词牌的模糊匹配，不使用搜索排名。
常见短诗只保留源文中完整五言七言句，长篇只取明确列出的句子；原文不匹配时构建失败，禁止静默补入或漏项。
仍可能因古籍异文或个体积累而感到陌生，后续可按真实答题反馈调整。源数据 MIT 许可证见 poetry-LICENSE.txt。
重建：python scripts/build-curated-poetry.py /path/to/chinese-poetry（需要 opencc-python-reimplemented）。
