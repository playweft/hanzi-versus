# 拾字成诗：熟悉诗句精选库
共 493 条作品分层记录（同一作品可有不同层的选句），2426 个候选句。
原文：https://github.com/chinese-poetry/chinese-poetry ，版本 b8594f81a89752241442f2ce267d6f66f96704ee。
分层：{"basic": {"poems": 82, "lines": 327}, "normal": {"poems": 120, "lines": 602}, "advanced": {"poems": 291, "lines": 1497}}。默认入门35%、普通55%、进阶10%，各层先抽作品再抽句子。
选篇：scripts/poetry-tiers.yaml 是全库选句与难度的唯一来源，每篇写作者、篇名、选句与题池，某几句要单独定档就写在该篇的 overrides 下。
出处另记四处：scripts/poetry-school.json 为课标目录，scripts/poetry-expansion.json 为《唐诗三百首》《千家诗》逐篇复核，scripts/poetry-restored.json 为通行异文核对，scripts/poetry-famous.json 为熟悉名句补充。四处只登记篇目与理由，不写句子。
每题都回查原文：选句必须逐字出现在对应出处；对上不构建失败，禁止静默补入或漏项。不是某一教材的完整篇目表，也不是对人群熟悉度的统计结论。
常见短诗只保留源文中完整五言七言句，长篇只取明确列出的句子。
仍可能因古籍异文或个体积累而感到陌生，后续可按真实答题反馈调整。源数据 MIT 许可证见 poetry-LICENSE.txt。
重建：python scripts/build-curated-poetry.py /path/to/chinese-poetry（需要 opencc-python-reimplemented 和 pyyaml）。
