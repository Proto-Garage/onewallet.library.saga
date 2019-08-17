export default function defer() {
  let resolve: (value?: any) => void = () => { };
  let reject: (value?: any) => void = () => { };

  const promise = new Promise(((...args) => {
    [resolve, reject] = args;
  }));

  return {
    resolve,
    reject,
    promise,
  };
}
