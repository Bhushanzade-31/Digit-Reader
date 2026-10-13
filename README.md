# Digit Reader (Flask + React)

## Backend
cd backend
pip install -r requirements.txt
# copy your mnist_model.keras into backend/
python app.py          # runs on :5000

## Frontend
cd frontend
npm install
npm run dev            # runs on :5173, proxies /api to Flask
