"""
审核模型 / 第三方审核 adapter 占位说明。

本项目内容安全核心实现见 model_guard.py(ModelModerationGuard, 异步 AsyncGuard,
接任意 OpenAI 兼容端点),以及 rules.py(规则引擎,同步 DFA)。

以下场景预留接入位,当前未实现,需要时补齐:

LlamaGuardGuard
  调用自部署 Llama Guard / Qwen 审核模型(HTTP)。
  参考 model_guard.py 的 ModelModerationGuard 实现——它已是通用 adapter,
  配置不同的 base_url/model 即可切换审核模型,不一定需要新类。

ThirdPartyGuard
  调用阿里云内容安全 / 腾讯云天御等有资质第三方审核。
  注意(见 docs/tech-stack.md 模块三):面向国内用户可能有强制合规要求,
  自建模型不能替代有资质第三方。实现时需接入对应厂商 SDK/API。

NoopGuard
  禁用审核时的空实现(始终放行)。当前由 SafetyPipeline 在
  safety_enabled=False 时以空 guard 列表实现,不需要此类。

为什么不用独立类?
  - 规则引擎 + ModelModerationGuard(异步 adapter)已覆盖当前需求。
  - 第三方审核的对接(鉴权、签名、格式转换)差异大,在具体接入时再做,
    提前抽象反而不灵活。
"""
