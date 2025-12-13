import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { addDecorator } from '@storybook/react';

addDecorator((storyFn: any) => <ChakraProvider>{storyFn()}</ChakraProvider>);
