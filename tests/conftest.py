"""pytest 配置:确保项目根在 sys.path,tests 无需安装包即可导入 app。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
