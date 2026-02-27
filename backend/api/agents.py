from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from agents.finance_agent import FinanceAgent

router = APIRouter()


# This defines what the request body looks like
class TaskRequest(BaseModel):
    message: str


# This defines what we send back
class TaskResponse(BaseModel):
    agent: str
    message: str
    response: str


@router.post("/finance", response_model=TaskResponse)
def run_finance_agent(request: TaskRequest):
    """Send a task to the Finance Agent."""
    
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    try:
        agent = FinanceAgent()
        response = agent.run(request.message)
        
        return TaskResponse(
            agent="Finance Agent",
            message=request.message,
            response=response
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))