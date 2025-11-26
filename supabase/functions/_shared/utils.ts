export class Utils {
    static chunkArray(arr, size){
        const chunks = [];
        for(let i = 0; i < arr.length; i += size){
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    };
}