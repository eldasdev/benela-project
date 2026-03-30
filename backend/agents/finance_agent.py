from agents.base_agent import BaseAgent
from agents.data_fetcher import get_onec_anomalies, get_onec_cashflow_forecast, get_onec_context


class FinanceAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="Finance Agent",
            system_prompt=(
                "You are an expert CFO-level AI assistant for the Finance module "
                "of Benela AI. You analyze real financial data and give sharp, "
                "actionable insights. "
                "RULES: "
                "1. Use the real data provided - reference actual numbers, names, dates. "
                "2. Never use markdown - no #, **, -, bullets. Plain text only. "
                "3. Never say you lack real-time access. You have live data. "
                "4. Be concise - 3-5 sentences max unless asked for detail. "
                "5. If something looks risky or unusual, flag it directly. "
                "6. When 1C integration data is present, treat it as the accounting source of truth. "
                "7. Prefer Uzbek sum (UZS) when currency is not explicitly specified. "
                "8. If 1C data is stale or anomalous, say so directly. "
                "9. If 1C context is active, explain findings using plain-language account meaning instead of raw codes unless the user explicitly asks for codes. "
                "10. Answer in the user's language when it is clear from the request, with Russian and Uzbek both acceptable. "
                "11. When relevant, align recommendations with Uzbek accounting practice and NSBU conventions."
            )
        )

    async def chat_with_1c(
        self,
        message: str,
        company_id: int,
        include_anomalies: bool = True,
        *,
        model: str | None = None,
        provider: str | None = None,
        temperature: float | None = None,
        extra_system_instructions: str | None = None,
        user_blocks: list[dict] | None = None,
    ) -> str:
        parts = [get_onec_context(company_id), get_onec_cashflow_forecast(company_id)]
        if include_anomalies:
            parts.append(get_onec_anomalies(company_id))
        context = "\n\n".join(part for part in parts if part).strip()
        return self.run(
            message,
            context=context,
            model=model,
            provider=provider,
            temperature=temperature,
            extra_system_instructions=extra_system_instructions,
            user_blocks=user_blocks,
        )
