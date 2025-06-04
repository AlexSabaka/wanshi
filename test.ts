import ollama from "ollama";

async function  test() {
    
const response = await ollama.chat({
    'model': 'qwen2.5-coder:1.5b',
    'think': false,
    'messages': [
        {
            'role': 'user',
            'content': 'How are you?',
        }
    ]
});

console.log(response.message.content);

}

test().then(() => console.log("done"));