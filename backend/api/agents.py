from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from agents.finance_agent import FinanceAgent
from agents.base_agent import BaseAgent
from agents.data_fetcher import get_context_for_section

router = APIRouter()


class TaskRequest(BaseModel):
    message: str


class TaskResponse(BaseModel):
    agent: str
    message: str
    response: str


def get_agent(section: str) -> BaseAgent:
    if section == "finance":
        return FinanceAgent()

    section_label = section.replace("_", " ").title()
    return BaseAgent(
        name=f"{section_label} Agent",
        system_prompt=(
            f"You are an expert AI assistant for the {section_label} module "
            f"of Benela AI, an enterprise ERP platform. "
            f"RULES: "
            f"1. Use the real data provided - reference actual numbers and names. "
            f"2. Never use markdown - no #, **, -, or bullet symbols. Plain text only. "
            f"3. Never say you lack real-time access. You have live data. "
            f"4. Be concise - 3-5 sentences max unless asked for detail. "
            f"5. Give direct answers, never ask clarifying questions first."
        )
    )


@router.post("/{section}", response_model=TaskResponse)
def run_agent(section: str, request: TaskRequest):
    """Send a message to the AI agent with real data context."""

    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        # 1) Pick the right agent
        agent = get_agent(section)

        # 2) Pull live context for this section
        context = get_context_for_section(section)

        # 3) Run model with injected context
        response = agent.run(request.message, context=context)

        return TaskResponse(
            agent=agent.name,
            message=request.message,
            response=response,
        )

    except Exception as e:
        error_msg = str(e)

        if "529" in error_msg or "overloaded" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="AI is temporarily busy. Please try again in a moment."
            )

        if "401" in error_msg or "authentication" in error_msg.lower():
            raise HTTPException(
                status_code=401,
                detail="AI authentication failed. Check your API key."
            )

        if "429" in error_msg or "rate limit" in error_msg.lower():
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment."
            )

        raise HTTPException(
            status_code=500,
            detail="Something went wrong. Please try again."
        )
