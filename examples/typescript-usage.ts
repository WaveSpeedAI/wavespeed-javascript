// Example of using the WaveSpeed client in TypeScript

import WaveSpeed, { RequestOptions } from 'wavespeed';

// Initialize the client with your API key (or set WAVESPEED_API_KEY environment variable)
const client = new WaveSpeed('YOUR_API_KEY');

// Example 1: Synchronous Image Generation (wait for result)
async function generateImageSync(): Promise<void> {
  try {
    // Define input parameters
    const input: Record<string, any> = {
      prompt: 'A futuristic cityscape with flying cars and neon lights',
      size: '1024*1024',
      num_inference_steps: 28,
      guidance_scale: 5.0,
      num_images: 1,
      seed: -1,
      enable_safety_checker: true
    };

    // Generate an image and wait for the result
    const prediction = await client.run('wavespeed-ai/flux-dev', input);

    // Print the generated image URLs
    prediction.outputs.forEach((imgUrl, i) => {
      console.log(`Image ${i+1}: ${imgUrl}`);
    });
  } catch (error) {
    console.error('Error generating image:', error);
  }
}

// Example 2: Non-blocking Image Generation with manual status checking
async function generateImageAsync(): Promise<void> {
  try {
    // Define input parameters
    const input: Record<string, any> = {
      prompt: 'A beautiful mountain landscape at sunset',
      size: '1024*1024',
      num_inference_steps: 28,
      guidance_scale: 5.0,
      num_images: 1,
      seed: -1,
      enable_safety_checker: true
    };

    // Create a prediction without waiting
    const prediction = await client.create('wavespeed-ai/flux-dev', input);

    console.log(`Prediction created with ID: ${prediction.id}`);
    console.log(`Initial status: ${prediction.status}`);

    // Manually check status by reloading the prediction
    let currentPrediction = prediction;
    
    // Poll until the prediction is complete
    while (currentPrediction.status === 'processing') {
      console.log('Prediction still processing, checking again in 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reload the prediction to get the latest status
      currentPrediction = await currentPrediction.reload();
      console.log(`Updated status: ${currentPrediction.status}`);
    }
    
    // Check the final status
    if (currentPrediction.status === 'completed' || currentPrediction.status === 'failed') {
      console.log('Prediction completed successfully!');
      
      // Print the generated image URLs
      currentPrediction.outputs.forEach((imgUrl, i) => {
        console.log(`Image ${i+1}: ${imgUrl}`);
      });
    } else {
      console.error(`Prediction failed with status: ${currentPrediction.status}`);
      if (currentPrediction.error) {
        console.error(`Error: ${currentPrediction.error}`);
      }
    }
  } catch (error) {
    console.error('Error generating image:', error);
  }
}

// Example 3: Custom fetch options
async function generateImageWithOptions(): Promise<void> {
  try {
    // Define input parameters
    const input: Record<string, any> = {
      prompt: 'A serene beach at dawn',
      size: '1024*1024',
      num_inference_steps: 28,
      guidance_scale: 5.0,
      num_images: 1,
      seed: -1,
      enable_safety_checker: true
    };

    // Define custom fetch options
    const options: RequestOptions = {
      timeout: 120000, // 2 minutes timeout
      headers: {
        'X-Custom-Header': 'custom-value'
      }
    };

    // Generate an image with custom fetch options
    const prediction = await client.run('wavespeed-ai/flux-dev', input, options);

    console.log(`Generated image: ${prediction.outputs[0]}`);
  } catch (error) {
    console.error('Error generating image:', error);
  }
}

// Run the examples
if (require.main === module) {
  // Uncomment one of these to run the example
  // generateImageSync();
  // generateImageAsync();
  // generateImageWithOptions();
  console.log('Uncomment one of the example functions to run it');
}
